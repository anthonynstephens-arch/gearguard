create index shopify_order_imports_account_idx
  on public.shopify_order_imports(account_id);

create policy shopify_order_imports_no_client_access
on public.shopify_order_imports for all to anon, authenticated
using (false) with check (false);
