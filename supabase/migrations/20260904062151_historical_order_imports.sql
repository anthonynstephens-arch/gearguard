create table public.shopify_order_imports (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  account_id uuid not null references public.allowance_accounts(id) on delete cascade,
  shopify_order_id text not null,
  shopify_order_name text not null,
  order_created_at timestamptz not null,
  order_amount numeric(12,2) not null check (order_amount >= 0),
  allowance_deducted numeric(12,2) not null default 0 check (allowance_deducted >= 0),
  imported_at timestamptz not null default now(),
  unique (department_id, shopify_order_id)
);

create index shopify_order_imports_member_idx
  on public.shopify_order_imports(member_id, order_created_at desc);

alter table public.shopify_order_imports enable row level security;
revoke all on public.shopify_order_imports from anon, authenticated;
grant select, insert, update, delete on public.shopify_order_imports to service_role;

create or replace function public.gg_import_shopify_order(
  p_account_id uuid, p_shopify_order_id text, p_shopify_order_name text,
  p_order_created_at timestamptz, p_amount numeric
) returns jsonb language plpgsql set search_path='public', 'pg_temp' as $$
declare a public.allowance_accounts%rowtype; inserted_id uuid; available numeric; deducted numeric; next_balance numeric;
begin
  if p_amount < 0 then raise exception 'Order amount cannot be negative'; end if;
  select * into a from public.allowance_accounts where id=p_account_id for update;
  if not found then raise exception 'Allowance account not found'; end if;
  insert into public.shopify_order_imports(department_id,member_id,account_id,shopify_order_id,shopify_order_name,order_created_at,order_amount)
  values(a.department_id,a.member_id,a.id,p_shopify_order_id,p_shopify_order_name,p_order_created_at,p_amount)
  on conflict (department_id,shopify_order_id) do nothing returning id into inserted_id;
  if inserted_id is null then return jsonb_build_object('imported',false,'deducted',0,'balance',a.current_balance); end if;
  available:=greatest(0,a.current_balance-a.reserved_amount); deducted:=least(available,p_amount); next_balance:=a.current_balance-deducted;
  update public.allowance_accounts set current_balance=next_balance,spent_amount=spent_amount+p_amount,version=version+1,updated_at=now() where id=a.id;
  update public.shopify_order_imports set allowance_deducted=deducted where id=inserted_id;
  insert into public.allowance_transactions(department_id,member_id,account_id,type,status,amount,balance_before,balance_after,reason,created_at)
  values(a.department_id,a.member_id,a.id,'PURCHASE','POSTED',-deducted,a.current_balance,next_balance,'Imported Shopify order '||p_shopify_order_name||' ('||to_char(p_amount,'FM$999999990.00')||')',p_order_created_at);
  return jsonb_build_object('imported',true,'deducted',deducted,'balance',next_balance);
end$$;

create or replace function public.gg_assign_annual_allowance(p_account_id uuid,p_amount numeric,p_reason text,p_manager_id uuid)
returns numeric language plpgsql set search_path='public', 'pg_temp' as $$
declare a public.allowance_accounts%rowtype; next_balance numeric; delta numeric;
begin
  if p_amount < 0 then raise exception 'Allowance cannot be negative'; end if;
  select * into a from public.allowance_accounts where id=p_account_id for update;
  if not found then raise exception 'Allowance account not found'; end if;
  next_balance:=greatest(a.reserved_amount,p_amount-a.spent_amount); delta:=next_balance-a.current_balance;
  update public.allowance_accounts set annual_amount=p_amount,current_balance=next_balance,version=version+1,updated_at=now() where id=a.id;
  insert into public.allowance_transactions(department_id,member_id,account_id,manager_id,type,status,amount,balance_before,balance_after,reason)
  values(a.department_id,a.member_id,a.id,p_manager_id,'ADJUSTMENT','POSTED',delta,a.current_balance,next_balance,p_reason);
  return next_balance;
end$$;

revoke all on function public.gg_import_shopify_order(uuid,text,text,timestamptz,numeric) from public,anon,authenticated;
revoke all on function public.gg_assign_annual_allowance(uuid,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.gg_import_shopify_order(uuid,text,text,timestamptz,numeric) to service_role;
grant execute on function public.gg_assign_annual_allowance(uuid,numeric,text,uuid) to service_role;
