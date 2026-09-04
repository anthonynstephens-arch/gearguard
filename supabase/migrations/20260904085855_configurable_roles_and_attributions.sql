create table public.department_roles (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  description text,
  portal_access text not null default 'member' check (portal_access in ('member','manager','admin')),
  created_at timestamptz not null default now(),
  unique (department_id,name)
);

alter table public.members
  add column department_role_id uuid references public.department_roles(id) on delete set null;

alter table public.departments
  add column chief_member_id uuid references public.members(id) on delete set null;

alter table public.shopify_order_imports
  alter column member_id drop not null,
  alter column account_id drop not null,
  add column purchaser_name text,
  add column allowance_accounted boolean not null default true;

create table public.allowance_item_attributions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  order_import_id uuid not null references public.shopify_order_imports(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  account_id uuid not null references public.allowance_accounts(id) on delete restrict,
  manager_id uuid references public.members(id) on delete set null,
  shopify_order_id text not null,
  shopify_order_name text not null,
  shopify_line_item_id text not null,
  line_item_name text not null,
  quantity integer not null check (quantity > 0),
  amount numeric(12,2) not null check (amount >= 0),
  allowance_deducted numeric(12,2) not null default 0 check (allowance_deducted >= 0),
  created_at timestamptz not null default now(),
  unique (department_id,shopify_order_id,shopify_line_item_id)
);

create index department_roles_department_idx on public.department_roles(department_id);
create index allowance_item_attributions_order_idx on public.allowance_item_attributions(order_import_id);
create index allowance_item_attributions_member_idx on public.allowance_item_attributions(member_id,created_at desc);

alter table public.department_roles enable row level security;
alter table public.allowance_item_attributions enable row level security;
revoke all on public.department_roles,public.allowance_item_attributions from anon,authenticated;
grant select,insert,update,delete on public.department_roles,public.allowance_item_attributions to service_role;

create or replace function public.gg_attribute_order_item(
  p_order_import_id uuid,p_account_id uuid,p_manager_id uuid,
  p_shopify_line_item_id text,p_line_item_name text,p_quantity integer,p_amount numeric
) returns jsonb language plpgsql set search_path='public','pg_temp' as $$
declare o public.shopify_order_imports%rowtype; a public.allowance_accounts%rowtype; inserted_id uuid; available numeric; deducted numeric; next_balance numeric;
begin
  if p_amount < 0 or p_quantity <= 0 then raise exception 'Invalid line item attribution'; end if;
  select * into o from public.shopify_order_imports where id=p_order_import_id for update;
  if not found then raise exception 'Imported order not found'; end if;
  if o.allowance_accounted then raise exception 'This order was already counted toward an allowance'; end if;
  select * into a from public.allowance_accounts where id=p_account_id and department_id=o.department_id for update;
  if not found then raise exception 'Allowance account not found in this department'; end if;
  insert into public.allowance_item_attributions(department_id,order_import_id,member_id,account_id,manager_id,shopify_order_id,shopify_order_name,shopify_line_item_id,line_item_name,quantity,amount)
  values(o.department_id,o.id,a.member_id,a.id,p_manager_id,o.shopify_order_id,o.shopify_order_name,p_shopify_line_item_id,p_line_item_name,p_quantity,p_amount)
  on conflict (department_id,shopify_order_id,shopify_line_item_id) do nothing returning id into inserted_id;
  if inserted_id is null then return jsonb_build_object('attributed',false,'deducted',0,'balance',a.current_balance); end if;
  available:=greatest(0,a.current_balance-a.reserved_amount);deducted:=least(available,p_amount);next_balance:=a.current_balance-deducted;
  update public.allowance_accounts set current_balance=next_balance,spent_amount=spent_amount+p_amount,version=version+1,updated_at=now() where id=a.id;
  update public.allowance_item_attributions set allowance_deducted=deducted where id=inserted_id;
  update public.shopify_order_imports set member_id=coalesce(member_id,a.member_id),account_id=coalesce(account_id,a.id) where id=o.id;
  insert into public.allowance_transactions(department_id,member_id,account_id,manager_id,type,status,amount,balance_before,balance_after,reason,created_at)
  values(a.department_id,a.member_id,a.id,p_manager_id,'PURCHASE','POSTED',-deducted,a.current_balance,next_balance,'Attributed Shopify item '||p_line_item_name||' from '||o.shopify_order_name,o.order_created_at);
  return jsonb_build_object('attributed',true,'deducted',deducted,'balance',next_balance);
end$$;

revoke all on function public.gg_attribute_order_item(uuid,uuid,uuid,text,text,integer,numeric) from public,anon,authenticated;
grant execute on function public.gg_attribute_order_item(uuid,uuid,uuid,text,text,integer,numeric) to service_role;
