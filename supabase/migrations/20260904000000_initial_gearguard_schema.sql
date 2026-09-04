create extension if not exists pgcrypto;
create schema if not exists private;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  fiscal_year text not null default extract(year from now())::text,
  default_annual_allowance numeric(12,2) not null default 0 check (default_annual_allowance >= 0),
  allowance_reset_date date,
  approval_required boolean not null default true,
  approval_threshold numeric(12,2),
  allow_personal_overage boolean not null default true,
  shopify_shop_domain text,
  shopify_company_id text unique,
  shopify_company_name text,
  shopify_company_location_id text,
  shopify_sync_status text not null default 'NOT_CONFIGURED',
  shopify_sync_error text,
  shopify_last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  department_id uuid not null references public.departments(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  badge_number text,
  employee_id text,
  rank text,
  station text,
  platoon text,
  role text not null default 'member' check (role in ('member','manager','admin')),
  status text not null default 'active' check (status in ('active','inactive','leave')),
  shopify_customer_id text,
  shopify_company_contact_id text unique,
  shopify_company_location_id text,
  shopify_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id,email)
);

create table public.allowance_accounts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  member_id uuid not null unique references public.members(id) on delete cascade,
  annual_amount numeric(12,2) not null default 0 check (annual_amount >= 0),
  current_balance numeric(12,2) not null default 0 check (current_balance >= 0),
  reserved_amount numeric(12,2) not null default 0 check (reserved_amount >= 0 and reserved_amount <= current_balance),
  spent_amount numeric(12,2) not null default 0 check (spent_amount >= 0),
  reset_date date,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null default 'Duty Wear',
  image_url text,
  price numeric(12,2) not null default 0,
  allowance_eligible boolean not null default true,
  approval_required boolean not null default false,
  active boolean not null default true,
  shopify_product_id text not null unique,
  shopify_handle text,
  shopify_vendor text,
  shopify_product_type text,
  shopify_tags text[] not null default '{}',
  variants jsonb not null default '[]'::jsonb,
  shopify_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  client_request_id text not null unique,
  request_number text not null unique,
  member_name text not null,
  status text not null check (status in ('DRAFT','PENDING_APPROVAL','PROCESSING','ORDERED','SHIPPED','COMPLETED','DENIED','CANCELLED')),
  total_amount numeric(12,2) not null default 0,
  allowance_amount numeric(12,2) not null default 0,
  reserved_allowance_amount numeric(12,2) not null default 0,
  allowance_reversed_amount numeric(12,2) not null default 0,
  personal_amount numeric(12,2) not null default 0,
  notes text,
  manager_id uuid references public.members(id),
  manager_name text,
  approval_notes text,
  denial_reason text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  shopify_draft_order_id text,
  shopify_order_id text,
  shopify_order_name text,
  shopify_invoice_url text,
  shopify_order_status text,
  shopify_synced_at timestamptz,
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  product_id uuid not null references public.products(id),
  product_name text not null,
  shopify_variant_id text not null,
  variant_title text,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  approved boolean not null default false,
  denial_reason text
);

create table public.allowance_transactions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  account_id uuid not null references public.allowance_accounts(id) on delete restrict,
  request_id uuid references public.purchase_requests(id) on delete set null,
  manager_id uuid references public.members(id) on delete set null,
  type text not null check (type in ('ANNUAL_ALLOCATION','MANUAL_CREDIT','MANUAL_DEBIT','ADJUSTMENT','PURCHASE','RESERVATION','RESERVATION_RELEASE','REFUND','CANCELLATION')),
  status text not null default 'POSTED' check (status in ('PENDING','POSTED','RELEASED','VOID')),
  amount numeric(12,2) not null,
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.approval_actions (
  id uuid primary key default gen_random_uuid(), department_id uuid not null references public.departments(id) on delete cascade,
  request_id uuid not null references public.purchase_requests(id) on delete cascade, manager_id uuid not null references public.members(id),
  action text not null check (action in ('APPROVE','PARTIAL_APPROVE','DENY')), notes text, created_at timestamptz not null default now()
);
create table public.shopify_sync_runs (
  id uuid primary key default gen_random_uuid(), department_id uuid not null references public.departments(id) on delete cascade,
  status text not null, members_created integer not null default 0, members_updated integer not null default 0, products_synced integer not null default 0,
  error text, started_at timestamptz not null default now(), finished_at timestamptz
);
create table public.shopify_webhook_events (
  id uuid primary key default gen_random_uuid(), webhook_id text not null unique, topic text not null, payload jsonb not null,
  status text not null default 'RECEIVED', received_at timestamptz not null default now(), processed_at timestamptz
);

create index members_department_idx on public.members(department_id);
create index requests_department_status_idx on public.purchase_requests(department_id,status,submitted_at desc);
create index requests_member_idx on public.purchase_requests(member_id,submitted_at desc);
create index transactions_member_idx on public.allowance_transactions(member_id,created_at desc);

create or replace function private.current_member_id() returns uuid language sql stable security definer set search_path='' as $$select id from public.members where auth_user_id=(select auth.uid()) and status='active' limit 1$$;
create or replace function private.current_department_id() returns uuid language sql stable security definer set search_path='' as $$select department_id from public.members where auth_user_id=(select auth.uid()) and status='active' limit 1$$;
create or replace function private.is_manager() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.members where auth_user_id=(select auth.uid()) and status='active' and role in ('manager','admin'))$$;
revoke all on function private.current_member_id() from public; revoke all on function private.current_department_id() from public; revoke all on function private.is_manager() from public;
grant usage on schema private to authenticated; grant execute on function private.current_member_id(),private.current_department_id(),private.is_manager() to authenticated;

alter table public.departments enable row level security; alter table public.members enable row level security; alter table public.allowance_accounts enable row level security;
alter table public.products enable row level security; alter table public.purchase_requests enable row level security; alter table public.purchase_items enable row level security;
alter table public.allowance_transactions enable row level security; alter table public.approval_actions enable row level security; alter table public.shopify_sync_runs enable row level security; alter table public.shopify_webhook_events enable row level security;

create policy department_read on public.departments for select to authenticated using (id=(select private.current_department_id()));
create policy member_read on public.members for select to authenticated using (id=(select private.current_member_id()) or (department_id=(select private.current_department_id()) and (select private.is_manager())));
create policy account_read on public.allowance_accounts for select to authenticated using (member_id=(select private.current_member_id()) or (department_id=(select private.current_department_id()) and (select private.is_manager())));
create policy product_read on public.products for select to authenticated using (active=true);
create policy request_read on public.purchase_requests for select to authenticated using (member_id=(select private.current_member_id()) or (department_id=(select private.current_department_id()) and (select private.is_manager())));
create policy item_read on public.purchase_items for select to authenticated using (member_id=(select private.current_member_id()) or (department_id=(select private.current_department_id()) and (select private.is_manager())));
create policy transaction_read on public.allowance_transactions for select to authenticated using (member_id=(select private.current_member_id()) or (department_id=(select private.current_department_id()) and (select private.is_manager())));
create policy approval_read on public.approval_actions for select to authenticated using (department_id=(select private.current_department_id()) and (select private.is_manager()));
create policy sync_read on public.shopify_sync_runs for select to authenticated using (department_id=(select private.current_department_id()) and (select private.is_manager()));

grant select on public.departments,public.members,public.allowance_accounts,public.products,public.purchase_requests,public.purchase_items,public.allowance_transactions,public.approval_actions,public.shopify_sync_runs to authenticated;
revoke all on public.shopify_webhook_events from anon,authenticated;

create or replace function public.gg_reserve_allowance(p_account_id uuid,p_amount numeric,p_request_id uuid,p_reason text) returns numeric language plpgsql security definer set search_path='public', 'pg_temp' as $$
declare a public.allowance_accounts%rowtype; available numeric;
begin if p_amount<=0 then return 0; end if; select * into a from public.allowance_accounts where id=p_account_id for update; if not found then raise exception 'Allowance account not found'; end if; available:=a.current_balance-a.reserved_amount; if available<p_amount then raise exception 'Insufficient available allowance'; end if; update public.allowance_accounts set reserved_amount=reserved_amount+p_amount,version=version+1,updated_at=now() where id=p_account_id; insert into public.allowance_transactions(department_id,member_id,account_id,request_id,type,status,amount,balance_before,balance_after,reason) values(a.department_id,a.member_id,a.id,p_request_id,'RESERVATION','PENDING',-p_amount,available,available-p_amount,p_reason); return available-p_amount; end$$;
create or replace function public.gg_release_allowance(p_account_id uuid,p_amount numeric,p_request_id uuid,p_reason text) returns numeric language plpgsql security definer set search_path='public', 'pg_temp' as $$
declare a public.allowance_accounts%rowtype; next_available numeric;
begin select * into a from public.allowance_accounts where id=p_account_id for update; if not found then raise exception 'Allowance account not found'; end if; if p_amount<0 or a.reserved_amount<p_amount then raise exception 'Invalid reservation release'; end if; update public.allowance_accounts set reserved_amount=reserved_amount-p_amount,version=version+1,updated_at=now() where id=p_account_id; update public.allowance_transactions set status='RELEASED' where request_id=p_request_id and type='RESERVATION' and status='PENDING'; next_available:=a.current_balance-a.reserved_amount+p_amount; insert into public.allowance_transactions(department_id,member_id,account_id,request_id,type,status,amount,balance_before,balance_after,reason) values(a.department_id,a.member_id,a.id,p_request_id,'RESERVATION_RELEASE','POSTED',p_amount,a.current_balance-a.reserved_amount,next_available,p_reason); return next_available; end$$;
create or replace function public.gg_commit_reservation(p_account_id uuid,p_reserved numeric,p_charge numeric,p_request_id uuid,p_reason text) returns numeric language plpgsql security definer set search_path='public', 'pg_temp' as $$
declare a public.allowance_accounts%rowtype; next_balance numeric;
begin select * into a from public.allowance_accounts where id=p_account_id for update; if not found then raise exception 'Allowance account not found'; end if; if p_reserved<0 or p_charge<0 or p_charge>p_reserved or a.reserved_amount<p_reserved or a.current_balance<p_charge then raise exception 'Invalid allowance commitment'; end if; next_balance:=a.current_balance-p_charge; update public.allowance_accounts set current_balance=next_balance,reserved_amount=reserved_amount-p_reserved,spent_amount=spent_amount+p_charge,version=version+1,updated_at=now() where id=p_account_id; update public.allowance_transactions set status='RELEASED' where request_id=p_request_id and type='RESERVATION' and status='PENDING'; insert into public.allowance_transactions(department_id,member_id,account_id,request_id,type,status,amount,balance_before,balance_after,reason) values(a.department_id,a.member_id,a.id,p_request_id,'PURCHASE','POSTED',-p_charge,a.current_balance,next_balance,p_reason); return next_balance; end$$;
create or replace function public.gg_credit_allowance(p_account_id uuid,p_amount numeric,p_request_id uuid,p_reason text) returns numeric language plpgsql security definer set search_path='public', 'pg_temp' as $$
declare a public.allowance_accounts%rowtype; next_balance numeric;
begin if p_amount<=0 then raise exception 'Credit must be positive'; end if; select * into a from public.allowance_accounts where id=p_account_id for update; next_balance:=a.current_balance+p_amount; update public.allowance_accounts set current_balance=next_balance,spent_amount=greatest(0,spent_amount-p_amount),version=version+1,updated_at=now() where id=p_account_id; insert into public.allowance_transactions(department_id,member_id,account_id,request_id,type,status,amount,balance_before,balance_after,reason) values(a.department_id,a.member_id,a.id,p_request_id,'REFUND','POSTED',p_amount,a.current_balance,next_balance,p_reason); return next_balance; end$$;
create or replace function public.gg_adjust_allowance(p_account_id uuid,p_mode text,p_amount numeric,p_reason text,p_manager_id uuid) returns numeric language plpgsql security definer set search_path='public', 'pg_temp' as $$
declare a public.allowance_accounts%rowtype; next_balance numeric; delta numeric; txn_type text;
begin select * into a from public.allowance_accounts where id=p_account_id for update; if not found then raise exception 'Allowance account not found'; end if; if p_mode='credit' then next_balance:=a.current_balance+p_amount;txn_type:='MANUAL_CREDIT';elsif p_mode='debit' then next_balance:=a.current_balance-p_amount;txn_type:='MANUAL_DEBIT';elsif p_mode='set' then next_balance:=p_amount;txn_type:='ADJUSTMENT';elsif p_mode='reset' then next_balance:=case when p_amount>0 then p_amount else a.annual_amount end;txn_type:='ANNUAL_ALLOCATION';else raise exception 'Invalid adjustment mode';end if;if next_balance<a.reserved_amount then raise exception 'Balance cannot be lower than reserved funds';end if;delta:=next_balance-a.current_balance;update public.allowance_accounts set current_balance=next_balance,annual_amount=case when p_mode in ('set','reset') then greatest(annual_amount,next_balance) else annual_amount end,spent_amount=case when p_mode='reset' then 0 else spent_amount end,version=version+1,updated_at=now() where id=p_account_id;insert into public.allowance_transactions(department_id,member_id,account_id,manager_id,type,status,amount,balance_before,balance_after,reason) values(a.department_id,a.member_id,a.id,p_manager_id,txn_type,'POSTED',delta,a.current_balance,next_balance,p_reason);return next_balance;end$$;

revoke all on function public.gg_reserve_allowance(uuid,numeric,uuid,text),public.gg_release_allowance(uuid,numeric,uuid,text),public.gg_commit_reservation(uuid,numeric,numeric,uuid,text),public.gg_credit_allowance(uuid,numeric,uuid,text),public.gg_adjust_allowance(uuid,text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.gg_reserve_allowance(uuid,numeric,uuid,text),public.gg_release_allowance(uuid,numeric,uuid,text),public.gg_commit_reservation(uuid,numeric,numeric,uuid,text),public.gg_credit_allowance(uuid,numeric,uuid,text),public.gg_adjust_allowance(uuid,text,numeric,text,uuid) to service_role;
