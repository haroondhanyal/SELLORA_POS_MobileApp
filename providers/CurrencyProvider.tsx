import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useAuth } from '@/providers/AuthProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { cacheCurrencyRate, fetchCurrencyRate, formatCurrency, getCachedCurrencyRate, getManualCurrencyRate, saveBaseCurrency as saveBusinessBaseCurrency, saveManualCurrencyRate } from '@/services/currency';
import { supportedCurrencies, type CurrencyCode, type CurrencyRate } from '@/services/currency';
import { requireSupabase } from '@/services/supabase';

type CurrencyState = {
  baseCurrency: CurrencyCode;
  currency: CurrencyCode;
  rate: number;
  rateUpdatedAt: string | null;
  rateSource: string;
  setCurrency: (currency: CurrencyCode) => Promise<void>;
  setBaseCurrency: (currency: CurrencyCode) => Promise<void>;
  saveManualRate: (currency: CurrencyCode, rate: number) => Promise<void>;
  refreshRate: () => Promise<void>;
  formatMoney: (amountInBaseCurrency: number) => string;
};
const CurrencyContext = createContext<CurrencyState | null>(null);
const settingsKey = 'currency_preferences';

/** Shares branch base currency and the cached display rate across commerce screens. */
export function CurrencyProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const { session } = useAuth();
  const { connected, mode } = useConnection();
  const [baseCurrency, setBaseCurrencyState] = useState<CurrencyCode>('PKR');
  const [currency, setCurrencyState] = useState<CurrencyCode>('PKR');
  const [rate, setRate] = useState(1);
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string | null>(null);
  const [rateSource, setRateSource] = useState('base currency');

  // Restore preferences locally first, then refresh the business setting when connected.
  useEffect(() => {
    let active = true;
    async function loadPreferences() {
      let localCurrency = currency;
      try {
        const local = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', settingsKey);
        if (local) {
          const saved = JSON.parse(local.value) as { baseCurrency?: CurrencyCode; currency?: CurrencyCode };
          if (saved.baseCurrency && isCurrency(saved.baseCurrency)) setBaseCurrencyState(saved.baseCurrency);
          if (saved.currency && isCurrency(saved.currency)) {
            localCurrency = saved.currency;
            setCurrencyState(saved.currency);
          }
        }
      } catch { /* Startup uses PKR if no local preference exists. */ }

      if (!session || !connected || mode !== 'online') return;
      try {
        const { data, error } = await requireSupabase().from('business_currency').select('base_currency').eq('id', 1).maybeSingle();
        if (error) throw error;
        const savedBase = data?.base_currency as CurrencyCode | undefined;
        if (active && savedBase) {
          setBaseCurrencyState(savedBase);
          await persistPreferences(db, savedBase, localCurrency);
        }
      } catch { /* Keep the cached base currency when the backend is not ready. */ }
    }
    void loadPreferences();
    return () => { active = false; };
  }, [db, session?.user.id, connected, mode]);

  const refreshRate = useCallback(async () => {
    if (baseCurrency === currency) {
      setRate(1); setRateUpdatedAt(null); setRateSource('base currency');
      return;
    }

    const cached = await getCachedCurrencyRate(db, baseCurrency, currency).catch(() => null);
    if (cached) applyRate(cached);
    const online = connected && mode === 'online' && Boolean(session);
    if (!online) return;

    try {
      const manual = await getManualCurrencyRate(baseCurrency, currency);
      if (manual) {
        await cacheCurrencyRate(db, baseCurrency, currency, manual);
        applyRate(manual);
        return;
      }
    } catch { /* Fall back to the saved device rate if the settings table is unavailable. */ }

    const cacheIsFresh = cached?.source === 'automatic'
      && Date.now() - Date.parse(cached.updatedAt) < 20 * 60 * 60 * 1000;
    if (cacheIsFresh) return;
    try {
      const automatic = await fetchCurrencyRate(baseCurrency, currency);
      await cacheCurrencyRate(db, baseCurrency, currency, automatic);
      applyRate(automatic);
    } catch { /* Keep the cached rate and let the currency screen explain its age. */ }
  }, [baseCurrency, currency, db, connected, mode, session?.user.id]);

  useEffect(() => { void refreshRate(); }, [refreshRate]);

  function applyRate(next: CurrencyRate) {
    setRate(next.rate);
    setRateUpdatedAt(next.updatedAt);
    setRateSource(next.source);
  }

  async function setCurrency(next: CurrencyCode) {
    setCurrencyState(next);
    await persistPreferences(db, baseCurrency, next);
  }

  async function setBaseCurrency(next: CurrencyCode) {
    await saveBusinessBaseCurrency(next);
    setBaseCurrencyState(next);
    await persistPreferences(db, next, currency);
  }

  async function saveManualRate(nextCurrency: CurrencyCode, nextRate: number) {
    await saveManualCurrencyRate(baseCurrency, nextCurrency, nextRate);
    const value = { rate: nextRate, updatedAt: new Date().toISOString(), source: 'manual' };
    await cacheCurrencyRate(db, baseCurrency, nextCurrency, value);
    if (currency === nextCurrency) applyRate(value);
  }

  const value = useMemo<CurrencyState>(() => ({
    baseCurrency, currency, rate, rateUpdatedAt, rateSource, setCurrency, setBaseCurrency,
    saveManualRate, refreshRate, formatMoney: (amount) => formatCurrency(amount * rate, currency),
  }), [baseCurrency, currency, rate, rateUpdatedAt, rateSource, refreshRate]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

async function persistPreferences(db: SQLiteDatabase, baseCurrency: CurrencyCode, currency: CurrencyCode) {
  await db.runAsync(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    settingsKey,
    JSON.stringify({ baseCurrency, currency }),
  );
}

function isCurrency(value: string): value is CurrencyCode {
  return (supportedCurrencies as readonly string[]).includes(value);
}

export function useCurrency() {
  const currency = useContext(CurrencyContext);
  if (!currency) throw new Error('useCurrency must be used inside CurrencyProvider.');
  return currency;
}
