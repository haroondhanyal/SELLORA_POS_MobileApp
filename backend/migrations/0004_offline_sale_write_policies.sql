-- A SECURITY DEFINER sale routine is still subject to FORCE ROW LEVEL SECURITY
-- in this standalone database. These policies mirror the routine's actor,
-- permission, branch, and parent-sale checks for every row it writes.

drop policy if exists "POS users can read sellable stock" on public.inventory;
create policy "POS users can read sellable stock"
  on public.inventory for select to public
  using (
    public.sellora_can('sales.create')
    and exists (select 1 from public.warehouses w where w.id = warehouse_id
      and public.sellora_can_access_branch(w.branch_id))
  );

drop policy if exists "Sellora API creates own branch sales" on public.sales;
create policy "Sellora API creates own branch sales"
  on public.sales for insert to public
  with check (
    user_id = (select auth.uid())
    and cashier_id = (select auth.uid())
    and public.sellora_can('sales.create')
    and public.sellora_can_access_branch(branch_id)
  );

drop policy if exists "Sellora API creates own sale items" on public.sale_items;
create policy "Sellora API creates own sale items"
  on public.sale_items for insert to public
  with check (exists (
    select 1 from public.sales s
    where s.id = sale_id and s.user_id = (select auth.uid())
      and public.sellora_can('sales.create')
  ));

drop policy if exists "Sellora API creates own sale payments" on public.payments;
create policy "Sellora API creates own sale payments"
  on public.payments for insert to public
  with check (exists (
    select 1 from public.sales s
    where s.id = sale_id and s.user_id = (select auth.uid())
      and public.sellora_can('sales.create')
  ));

drop policy if exists "Sellora API deducts stock for own sales" on public.inventory;
create policy "Sellora API deducts stock for own sales"
  on public.inventory for update to public
  using (
    public.sellora_can('sales.create')
    and exists (select 1 from public.warehouses w where w.id = warehouse_id
      and public.sellora_can_access_branch(w.branch_id))
  )
  with check (
    public.sellora_can('sales.create')
    and exists (select 1 from public.warehouses w where w.id = warehouse_id
      and public.sellora_can_access_branch(w.branch_id))
  );

drop policy if exists "Sellora API records own sale inventory movements" on public.inventory_movements;
create policy "Sellora API records own sale inventory movements"
  on public.inventory_movements for insert to public
  with check (
    movement_type = 'sale'
    and created_by = (select auth.uid())
    and public.sellora_can('sales.create')
    and exists (
      select 1 from public.sales s
      join public.warehouses w on w.id = warehouse_id
      where s.id = sale_id and s.user_id = (select auth.uid())
        and s.warehouse_id = w.id and public.sellora_can_access_branch(w.branch_id)
    )
  );

drop policy if exists "Sellora API updates customer balances for own sales" on public.customers;
create policy "Sellora API updates customer balances for own sales"
  on public.customers for update to public
  using (
    (public.sellora_can('customers.manage') or public.sellora_can('sales.create'))
    and public.sellora_can_access_branch(branch_id)
  )
  with check (
    (public.sellora_can('customers.manage') or public.sellora_can('sales.create'))
    and public.sellora_can_access_branch(branch_id)
  );

drop policy if exists "Sellora API records sale commissions" on public.agent_commissions;
create policy "Sellora API records sale commissions"
  on public.agent_commissions for insert to public
  with check (exists (
    select 1 from public.sales s
    where s.id = sale_id and s.user_id = (select auth.uid())
      and s.sales_agent_id = agent_id and s.branch_id = branch_id
      and public.sellora_can('sales.create')
  ));

drop policy if exists "Sellora API records sale loyalty" on public.loyalty_transactions;
create policy "Sellora API records sale loyalty"
  on public.loyalty_transactions for insert to public
  with check (
    sale_id is not null and exists (
      select 1 from public.sales s
      where s.id = sale_id and s.user_id = (select auth.uid())
        and s.customer_id = customer_id and public.sellora_can('sales.create')
    )
  );

drop policy if exists "Sellora API audits own branch operations" on public.audit_logs;
create policy "Sellora API audits own branch operations"
  on public.audit_logs for insert to public
  with check (
    actor_id = (select auth.uid())
    and public.sellora_can_access_branch(branch_id)
    and (
      public.sellora_can('sales.create')
      or public.sellora_can('returns.manage')
      or public.sellora_can('expenses.manage')
    )
  );

drop policy if exists "Sellora API maps own offline sales" on public.synced_offline_sales;
create policy "Sellora API maps own offline sales"
  on public.synced_offline_sales for insert to public
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.sales s
      where s.id = sale_id and s.user_id = (select auth.uid()))
  );
