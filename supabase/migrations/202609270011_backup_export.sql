-- Phase 12: owner-only point-in-time JSON export without exposing service credentials.
create or replace function public.sellora_export_business_backup()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());
begin
 if actor is null or not public.sellora_is_admin() then raise exception 'Only an approved administrator can export a business backup'; end if;
 return jsonb_build_object(
  'schema_version',1,'exported_at',now(),'business_currency',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.business_currency x),
  'branches',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.branches x),
  'warehouses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.warehouses x),
  'profiles',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.profiles x),
  'user_branches',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.user_branches x),
  'categories',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.categories x),
  'brands',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.brands x),
  'products',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.products x),
  'product_variants',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.product_variants x),
  'inventory',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.inventory x),
  'inventory_movements',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.inventory_movements x),
  'stock_adjustments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.stock_adjustments x),
  'customers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.customers x),
  'sales',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sales x),
  'sale_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sale_items x),
  'payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.payments x),
  'returns',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sales_returns x),
  'return_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sales_return_items x),
  'customer_account_payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.customer_account_payments x),
  'loyalty_transactions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.loyalty_transactions x),
  'expenses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.expenses x),
  'suppliers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.suppliers x),
  'purchase_orders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.purchase_orders x),
  'purchase_order_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.purchase_order_items x),
  'goods_received_notes',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.goods_received_notes x),
  'goods_received_note_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.goods_received_note_items x),
  'stock_transfers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.stock_transfers x),
  'stock_transfer_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.stock_transfer_items x),
  'employee_shifts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.employee_shifts x),
  'sales_targets',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sales_targets x),
  'agent_commissions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.agent_commissions x),
  'approvals',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.approvals x),
  'audit_logs',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.audit_logs x),
  'exchange_rates',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.exchange_rates x)
 );
end $$;
revoke all on function public.sellora_export_business_backup() from public;
grant execute on function public.sellora_export_business_backup() to authenticated;
