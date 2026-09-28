-- Allow the existing permission-checking SECURITY DEFINER routines to perform
-- their atomic purchase, transfer, return, shift, and customer-credit writes
-- while forced RLS remains active for every table.

drop policy if exists "Inventory managers create inventory" on public.inventory;
create policy "Inventory managers create inventory"
  on public.inventory for insert to public
  with check (
    (public.sellora_can('inventory.manage') or public.sellora_can('returns.manage'))
    and exists (select 1 from public.warehouses w where w.id = warehouse_id
      and public.sellora_can_access_branch(w.branch_id))
  );

drop policy if exists "Inventory managers update inventory" on public.inventory;
create policy "Inventory managers update inventory"
  on public.inventory for update to public
  using (
    (public.sellora_can('inventory.manage') or public.sellora_can('returns.manage'))
    and exists (select 1 from public.warehouses w where w.id = warehouse_id
      and public.sellora_can_access_branch(w.branch_id))
  )
  with check (
    (public.sellora_can('inventory.manage') or public.sellora_can('returns.manage'))
    and exists (select 1 from public.warehouses w where w.id = warehouse_id
      and public.sellora_can_access_branch(w.branch_id))
  );

drop policy if exists "Sellora API updates customer balances for own sales" on public.customers;
create policy "Sellora API updates customer balances for own sales"
  on public.customers for update to public
  using (
    (public.sellora_can('customers.manage') or public.sellora_can('sales.create')
      or public.sellora_can('returns.manage') or public.sellora_can('customers.credit.manage'))
    and public.sellora_can_access_branch(branch_id)
  )
  with check (
    (public.sellora_can('customers.manage') or public.sellora_can('sales.create')
      or public.sellora_can('returns.manage') or public.sellora_can('customers.credit.manage'))
    and public.sellora_can_access_branch(branch_id)
  );

drop policy if exists "Sellora API updates sale status for returns" on public.sales;
create policy "Sellora API updates sale status for returns"
  on public.sales for update to public
  using (public.sellora_can('returns.manage') and public.sellora_can_access_branch(branch_id))
  with check (public.sellora_can('returns.manage') and public.sellora_can_access_branch(branch_id));

drop policy if exists "Sellora API creates returns in assigned branches" on public.sales_returns;
create policy "Sellora API creates returns in assigned branches"
  on public.sales_returns for insert to public
  with check (
    created_by = (select auth.uid())
    and public.sellora_can('returns.manage')
    and public.sellora_can_access_branch(branch_id)
    and exists (select 1 from public.sales s
      where s.id = public.sales_returns.sale_id and s.branch_id = public.sales_returns.branch_id)
  );

drop policy if exists "Sellora API creates returned sale lines" on public.sales_return_items;
create policy "Sellora API creates returned sale lines"
  on public.sales_return_items for insert to public
  with check (exists (
    select 1 from public.sales_returns r
    where r.id = return_id and public.sellora_can('returns.manage')
      and public.sellora_can_access_branch(r.branch_id)
  ));

drop policy if exists "Sellora API records return stock movement" on public.inventory_movements;
create policy "Sellora API records return stock movement"
  on public.inventory_movements for insert to public
  with check (
    movement_type = 'return'
    and created_by = (select auth.uid())
    and public.sellora_can('returns.manage')
    and exists (select 1 from public.warehouses w where w.id = warehouse_id
      and public.sellora_can_access_branch(w.branch_id))
  );

drop policy if exists "Sellora API records transfer and purchase stock movements" on public.inventory_movements;
create policy "Sellora API records transfer and purchase stock movements"
  on public.inventory_movements for insert to public
  with check (
    movement_type in ('transfer_in', 'transfer_out', 'purchase')
    and created_by = (select auth.uid())
    and public.sellora_can('inventory.manage')
    and exists (select 1 from public.warehouses w where w.id = warehouse_id
      and public.sellora_can_access_branch(w.branch_id))
  );

drop policy if exists "Sellora API records customer credit payments" on public.customer_account_payments;
create policy "Sellora API records customer credit payments"
  on public.customer_account_payments for insert to public
  with check (
    received_by = (select auth.uid())
    and public.sellora_can('customers.credit.manage')
    and public.sellora_can_access_branch(branch_id)
  );

drop policy if exists "Sellora API audits assigned branch operations" on public.audit_logs;
create policy "Sellora API audits assigned branch operations"
  on public.audit_logs for insert to public
  with check (
    actor_id = (select auth.uid())
    and (branch_id is null or public.sellora_can_access_branch(branch_id))
    and (
      public.sellora_can('inventory.manage')
      or public.sellora_can('shifts.manage')
      or public.sellora_can('customers.credit.manage')
      or public.sellora_can('approvals.request')
      or public.sellora_can('approvals.view')
    )
  );

drop policy if exists "Sellora API redeems customer loyalty" on public.loyalty_transactions;
create policy "Sellora API redeems customer loyalty"
  on public.loyalty_transactions for insert to public
  with check (
    sale_id is null and points < 0
    and public.sellora_can('customers.manage')
    and exists (select 1 from public.customers c where c.id = customer_id
      and public.sellora_can_access_branch(c.branch_id))
  );

drop policy if exists "Sellora API creates assigned stock transfers" on public.stock_transfers;
create policy "Sellora API creates assigned stock transfers"
  on public.stock_transfers for insert to public
  with check (
    created_by = (select auth.uid())
    and status = 'requested'
    and public.sellora_can('inventory.manage')
    and public.sellora_can_access_branch(from_branch_id)
    and public.sellora_can_access_branch(to_branch_id)
  );

drop policy if exists "Sellora API updates assigned stock transfers" on public.stock_transfers;
create policy "Sellora API updates assigned stock transfers"
  on public.stock_transfers for update to public
  using (
    public.sellora_can('inventory.manage')
    and (public.sellora_can_access_branch(from_branch_id) or public.sellora_can_access_branch(to_branch_id))
  )
  with check (
    public.sellora_can('inventory.manage')
    and (public.sellora_can_access_branch(from_branch_id) or public.sellora_can_access_branch(to_branch_id))
    and (approved_by is null or approved_by = (select auth.uid()))
  );

drop policy if exists "Sellora API creates requested transfer lines" on public.stock_transfer_items;
create policy "Sellora API creates requested transfer lines"
  on public.stock_transfer_items for insert to public
  with check (exists (
    select 1 from public.stock_transfers t
    where t.id = transfer_id and t.created_by = (select auth.uid())
      and t.status = 'requested' and public.sellora_can('inventory.manage')
  ));

drop policy if exists "Sellora API creates assigned purchase orders" on public.purchase_orders;
create policy "Sellora API creates assigned purchase orders"
  on public.purchase_orders for insert to public
  with check (
    ordered_by = (select auth.uid())
    and public.sellora_can('inventory.manage')
    and public.sellora_can_access_branch(branch_id)
    and exists (select 1 from public.warehouses w where w.id = warehouse_id and w.branch_id = branch_id)
  );

drop policy if exists "Sellora API updates assigned purchase orders" on public.purchase_orders;
create policy "Sellora API updates assigned purchase orders"
  on public.purchase_orders for update to public
  using (public.sellora_can('inventory.manage') and public.sellora_can_access_branch(branch_id))
  with check (public.sellora_can('inventory.manage') and public.sellora_can_access_branch(branch_id));

drop policy if exists "Sellora API creates purchase order lines" on public.purchase_order_items;
create policy "Sellora API creates purchase order lines"
  on public.purchase_order_items for insert to public
  with check (exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_id and po.ordered_by = (select auth.uid())
      and po.status = 'ordered' and public.sellora_can('inventory.manage')
      and public.sellora_can_access_branch(po.branch_id)
  ));

drop policy if exists "Sellora API receives purchase order lines" on public.purchase_order_items;
create policy "Sellora API receives purchase order lines"
  on public.purchase_order_items for update to public
  using (exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_id and public.sellora_can('inventory.manage')
      and public.sellora_can_access_branch(po.branch_id)
  ))
  with check (exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_id and public.sellora_can('inventory.manage')
      and public.sellora_can_access_branch(po.branch_id)
  ));

drop policy if exists "Sellora API creates goods receipts" on public.goods_received_notes;
create policy "Sellora API creates goods receipts"
  on public.goods_received_notes for insert to public
  with check (
    received_by = (select auth.uid())
    and public.sellora_can('inventory.manage')
    and exists (select 1 from public.purchase_orders po
      where po.id = purchase_order_id and public.sellora_can_access_branch(po.branch_id))
  );

drop policy if exists "Sellora API records received purchase lines" on public.goods_received_note_items;
create policy "Sellora API records received purchase lines"
  on public.goods_received_note_items for insert to public
  with check (exists (
    select 1 from public.goods_received_notes grn
    join public.purchase_orders po on po.id = grn.purchase_order_id
    where grn.id = goods_received_note_id and grn.received_by = (select auth.uid())
      and public.sellora_can('inventory.manage') and public.sellora_can_access_branch(po.branch_id)
  ));

drop policy if exists "Sellora API opens own branch shifts" on public.employee_shifts;
create policy "Sellora API opens own branch shifts"
  on public.employee_shifts for insert to public
  with check (
    user_id = (select auth.uid()) and public.sellora_can('shifts.manage')
    and public.sellora_can_access_branch(branch_id)
  );
drop policy if exists "Sellora API updates authorized shifts" on public.employee_shifts;
create policy "Sellora API updates authorized shifts"
  on public.employee_shifts for update to public
  using (user_id = (select auth.uid()) or public.sellora_can('targets.manage'))
  with check (user_id = (select auth.uid()) or public.sellora_can('targets.manage'));

drop policy if exists "Sellora API manages branch sales targets" on public.sales_targets;
create policy "Sellora API manages branch sales targets"
  on public.sales_targets for insert to public
  with check (
    created_by = (select auth.uid()) and public.sellora_can('targets.manage')
    and public.sellora_can_access_branch(branch_id)
  );
drop policy if exists "Sellora API updates branch sales targets" on public.sales_targets;
create policy "Sellora API updates branch sales targets"
  on public.sales_targets for update to public
  using (public.sellora_can('targets.manage') and public.sellora_can_access_branch(branch_id))
  with check (public.sellora_can('targets.manage') and public.sellora_can_access_branch(branch_id));

drop policy if exists "Sellora API manages commission rules" on public.commission_rules;
create policy "Sellora API manages commission rules"
  on public.commission_rules for insert to public
  with check (
    created_by = (select auth.uid()) and public.sellora_can('targets.manage')
    and public.sellora_can_access_branch(branch_id)
  );
drop policy if exists "Sellora API updates commission rules" on public.commission_rules;
create policy "Sellora API updates commission rules"
  on public.commission_rules for update to public
  using (public.sellora_can('targets.manage') and public.sellora_can_access_branch(branch_id))
  with check (public.sellora_can('targets.manage') and public.sellora_can_access_branch(branch_id));

drop policy if exists "Sellora API records cash drawer entries" on public.cash_drawer_entries;
create policy "Sellora API records cash drawer entries"
  on public.cash_drawer_entries for insert to public
  with check (
    created_by = (select auth.uid()) and public.sellora_can('shifts.manage')
    and exists (select 1 from public.employee_shifts s
      where s.id = shift_id and (s.user_id = (select auth.uid()) or public.sellora_can('targets.manage')))
  );

drop policy if exists "Sellora API reviews approvals" on public.approvals;
create policy "Sellora API reviews approvals"
  on public.approvals for update to public
  using (
    status = 'pending' and public.sellora_can('approvals.view')
    and (branch_id is null or public.sellora_can_access_branch(branch_id))
  )
  with check (
    status in ('approved', 'rejected') and reviewed_by = (select auth.uid())
    and public.sellora_can('approvals.view')
    and (branch_id is null or public.sellora_can_access_branch(branch_id))
  );

drop policy if exists "Sellora API sends permitted operation notifications" on public.notifications;
create policy "Sellora API sends permitted operation notifications"
  on public.notifications for insert to public
  with check (
    (user_id = (select auth.uid()) and public.sellora_can('notifications.view'))
    or (category = 'inventory' and public.sellora_can('inventory.manage') and exists (
      select 1 from public.stock_transfers t where t.created_by = user_id
        and public.sellora_can_access_branch(t.from_branch_id)
    ))
    or (category = 'approvals' and public.sellora_can('approvals.view') and exists (
      select 1 from public.approvals a where a.requester_id = user_id
        and a.reviewed_by = (select auth.uid()) and a.reviewed_at >= transaction_timestamp()
    ))
    or (category = 'approvals' and title = 'Approval needs review'
        and exists (select 1 from public.app_profiles requester
          where requester.id = (select auth.uid()) and requester.approval_status = 'pending'))
    or (category = 'account' and public.sellora_can('users.manage'))
  );
