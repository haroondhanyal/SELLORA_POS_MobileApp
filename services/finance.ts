import { requireDatabase } from '@/services/database';
import * as SQLite from 'expo-sqlite';
import { decryptLocalJson, encryptLocalJson } from '@/services/localEncryption';

export type FinanceOverview = {
  salesCount: number;
  salesTotal: number;
  grossMargin: number;
  expenses: { id: string; category: string; description: string; amount: number | string; payment_method: string; created_at: string }[];
  expenseTotal: number;
  refundsTotal: number;
  commissionsTotal: number;
  cachedOffline: boolean;
};

/** Loads only the finance rows the current permission set allows the screen to show. */
export async function getFinanceOverview(
  branchId: string,
  start: string,
  access: { sales: boolean; expenses: boolean; userId: string },
): Promise<FinanceOverview> {
  const cacheKey = `finance:${access.userId}:${branchId}:${new Date(start).toISOString().slice(0, 10)}:${Number(access.sales)}${Number(access.expenses)}`;
  const db = await SQLite.openDatabaseAsync('sellora.db');
  try {
    const client = requireDatabase();
    const [sales, items, expenses, refunds, commissions] = await Promise.all([
    access.sales
      ? client.from('sales').select('id,total,status').eq('branch_id', branchId).gte('created_at', start).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    access.sales
      ? client.from('sale_items').select('quantity,unit_cost,line_total,tax_amount,sales!inner(status,branch_id,created_at)')
        .eq('sales.branch_id', branchId).eq('sales.status', 'completed').gte('sales.created_at', start).limit(10000)
      : Promise.resolve({ data: [], error: null }),
    access.expenses
      ? client.from('expenses').select('id,category,description,amount,payment_method,created_at')
        .eq('branch_id', branchId).gte('created_at', start).order('created_at', { ascending: false }).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    access.sales
      ? client.from('sales_returns').select('refund_total,created_at').eq('branch_id', branchId).gte('created_at', start).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    access.sales
      ? client.from('agent_commissions').select('commission_amount,created_at').eq('branch_id', branchId).gte('created_at', start).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [sales, items, expenses, refunds, commissions]) {
      if (result.error) throw result.error;
    }

    const completedSales = (sales.data ?? []).filter((sale) => sale.status === 'completed');
    const completedItems = items.data ?? [];
    const expenseRows = expenses.data ?? [];
    const result: FinanceOverview = {
      salesCount: completedSales.length,
      salesTotal: completedSales.reduce((sum, sale) => sum + Number(sale.total), 0),
      grossMargin: completedItems.reduce((sum, item) => sum + Number(item.line_total) - Number(item.tax_amount) - Number(item.unit_cost) * Number(item.quantity), 0),
      expenses: expenseRows,
      expenseTotal: expenseRows.reduce((sum, expense) => sum + Number(expense.amount), 0),
      refundsTotal: (refunds.data ?? []).reduce((sum, row) => sum + Number(row.refund_total), 0),
      commissionsTotal: (commissions.data ?? []).reduce((sum, row) => sum + Number(row.commission_amount), 0),
      cachedOffline: false,
    };
    const payload = await encryptLocalJson(result);
    await db.runAsync("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", cacheKey, payload);
    return result;
  } catch (error) {
    const cached = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', cacheKey);
    if (!cached) throw error;
    return { ...await decryptLocalJson<FinanceOverview>(cached.value), cachedOffline: true };
  }
}
