import type { SQLiteDatabase } from 'expo-sqlite';
import { requireDatabase } from '@/services/database';
import { getCurrentUser } from '@/services/auth';

export const supportedCurrencies = ['PKR', 'USD'] as const;
export type CurrencyCode = typeof supportedCurrencies[number];
export type CurrencyRate = { rate: number; updatedAt: string; source: string };

/** Fetches one currency's current daily rates from the public ExchangeRate-API endpoint. */
export async function fetchCurrencyRate(base: CurrencyCode, quote: CurrencyCode): Promise<CurrencyRate> {
  const response = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!response.ok) throw new Error('Exchange-rate service is not available.');
  const payload = await response.json() as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
  const rate = payload.rates?.[quote];
  if (payload.result !== 'success' || !rate || !Number.isFinite(rate)) throw new Error('No exchange rate was returned for this currency.');
  return { rate, updatedAt: payload.time_last_update_utc ?? new Date().toISOString(), source: 'automatic' };
}

/** Reads an offline rate saved on this device. */
export async function getCachedCurrencyRate(db: SQLiteDatabase, base: CurrencyCode, quote: CurrencyCode) {
  return db.getFirstAsync<CurrencyRate>(
    'SELECT rate, updated_at as updatedAt, source FROM exchange_rate_cache WHERE base_currency = ? AND quote_currency = ?',
    base,
    quote,
  );
}

/** Stores an automatic or manually approved rate locally for offline display. */
export async function cacheCurrencyRate(db: SQLiteDatabase, base: CurrencyCode, quote: CurrencyCode, value: CurrencyRate) {
  await db.runAsync(
    `INSERT INTO exchange_rate_cache(base_currency, quote_currency, rate, source, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(base_currency, quote_currency) DO UPDATE SET rate = excluded.rate, source = excluded.source, updated_at = excluded.updated_at`,
    base, quote, value.rate, value.source, value.updatedAt,
  );
}

/** Prefers an administrator's manual rate over the daily online rate. */
export async function getManualCurrencyRate(base: CurrencyCode, quote: CurrencyCode) {
  const { data, error } = await requireDatabase().from('exchange_rates')
    .select('rate, updated_at').eq('base_currency', base).eq('quote_currency', quote).eq('source', 'manual').maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { rate: Number(data.rate), updatedAt: data.updated_at, source: 'manual' } as CurrencyRate;
}

/** Stores the business's base currency; the database allows only approved administrators. */
export async function saveBaseCurrency(base: CurrencyCode) {
  const client = requireDatabase();
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in as an administrator first.');
  const { error } = await client.from('business_currency').update({ base_currency: base, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) throw error;
}

/** Saves a manual base-to-quote rate that takes priority over automatic updates. */
export async function saveManualCurrencyRate(base: CurrencyCode, quote: CurrencyCode, rate: number) {
  const client = requireDatabase();
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in as an administrator first.');
  const { error } = await client.from('exchange_rates').upsert({
    base_currency: base,
    quote_currency: quote,
    rate,
    source: 'manual',
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Formats a monetary amount using the selected display currency. */
export function formatCurrency(amount: number, currency: CurrencyCode) {
  return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}
