import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Uses the caller's RLS-scoped data and sends only compact aggregates to the AI provider. */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!apiKey || !projectUrl || !anonKey) return json({ error: 'Copilot is not configured. Ask an administrator to set the server secrets.' }, 503);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Sign in to use Sellora Copilot.' }, 401);

  const supabase = createClient(projectUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Your session has expired. Sign in again.' }, 401);
  const { question } = await request.json();
  if (typeof question !== 'string' || question.trim().length < 3 || question.length > 500) return json({ error: 'Enter a question up to 500 characters.' }, 400);

  // RLS limits sales and stock to the current user's own/assigned branches.
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [salesResult, itemsResult, stockResult] = await Promise.all([
    supabase.from('sales').select('total,status,created_at').gte('created_at', since).limit(3000),
    supabase.from('sale_items').select('product_name,quantity,line_total,sales!inner(created_at,status)').gte('sales.created_at', since).limit(5000),
    supabase.from('inventory').select('quantity,products!inner(name,minimum_stock),warehouses!inner(branch_id)').limit(2000),
  ]);
  if (salesResult.error || itemsResult.error || stockResult.error) return json({ error: 'Your role cannot read enough business data for this question.' }, 403);

  const sales = salesResult.data ?? [];
  const items = itemsResult.data ?? [];
  const stock = stockResult.data ?? [];
  const totalRevenue = sales.filter((sale) => sale.status === 'completed').reduce((sum, sale) => sum + Number(sale.total), 0);
  const productTotals = new Map<string, { quantity: number; revenue: number }>();
  for (const item of items) {
    const row = productTotals.get(item.product_name) ?? { quantity: 0, revenue: 0 };
    row.quantity += Number(item.quantity);
    row.revenue += Number(item.line_total);
    productTotals.set(item.product_name, row);
  }
  const topProducts = [...productTotals.entries()].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  const lowStock = stock.filter((row) => Number(row.quantity) <= Number(row.products.minimum_stock)).slice(0, 30).map((row) => ({ name: row.products.name, quantity: Number(row.quantity), minimum: Number(row.products.minimum_stock) }));
  const context = { period_days: 30, completed_sales: sales.filter((sale) => sale.status === 'completed').length, recorded_revenue_base_currency: totalRevenue, top_products_by_quantity: topProducts, low_stock_items: lowStock };
  const ai = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('SELLORA_AI_MODEL') ?? 'gpt-4.1-mini', input: [
      { role: 'system', content: 'You are Sellora retail copilot. Answer only from the supplied aggregate data. State the 30-day period and that money is in the business base currency. Do not invent missing values. If the data does not answer a question, say so plainly. Keep the answer concise and practical.' },
      { role: 'user', content: `Business data: ${JSON.stringify(context)}\nQuestion: ${question.trim()}` },
    ] }),
  });
  if (!ai.ok) return json({ error: 'The AI service could not answer right now. Try again shortly.' }, 502);
  const result = await ai.json();
  const answer = result.output_text ?? '';
  if (!answer) return json({ error: 'The AI service returned an empty answer.' }, 502);
  return json({ answer, periodDays: 30 });
});

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
