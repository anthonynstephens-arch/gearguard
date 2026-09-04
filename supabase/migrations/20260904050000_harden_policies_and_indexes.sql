create policy webhook_events_no_client_access
on public.shopify_webhook_events
for all
to anon, authenticated
using (false)
with check (false);

create index if not exists allowance_accounts_department_idx
  on public.allowance_accounts(department_id);
create index if not exists allowance_transactions_account_idx
  on public.allowance_transactions(account_id);
create index if not exists allowance_transactions_department_idx
  on public.allowance_transactions(department_id);
create index if not exists allowance_transactions_manager_idx
  on public.allowance_transactions(manager_id);
create index if not exists allowance_transactions_request_idx
  on public.allowance_transactions(request_id);
create index if not exists approval_actions_department_idx
  on public.approval_actions(department_id);
create index if not exists approval_actions_manager_idx
  on public.approval_actions(manager_id);
create index if not exists approval_actions_request_idx
  on public.approval_actions(request_id);
create index if not exists purchase_items_department_idx
  on public.purchase_items(department_id);
create index if not exists purchase_items_member_idx
  on public.purchase_items(member_id);
create index if not exists purchase_items_product_idx
  on public.purchase_items(product_id);
create index if not exists purchase_items_request_idx
  on public.purchase_items(request_id);
create index if not exists purchase_requests_manager_idx
  on public.purchase_requests(manager_id);
create index if not exists shopify_sync_runs_department_idx
  on public.shopify_sync_runs(department_id);
