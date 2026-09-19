create table public.member_pin_credentials (
  member_id uuid primary key references public.members(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  pin_hash text not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pin_login_attempts (
  identifier_hash text primary key,
  attempt_count integer not null default 1 check (attempt_count > 0),
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_pin_credentials_department_idx
  on public.member_pin_credentials(department_id);

alter table public.member_pin_credentials enable row level security;
alter table public.pin_login_attempts enable row level security;

revoke all on public.member_pin_credentials, public.pin_login_attempts
  from public, anon, authenticated;

grant select, insert, update, delete on public.member_pin_credentials, public.pin_login_attempts
  to service_role;
