create table public.shopify_collections (
  id uuid primary key default gen_random_uuid(),
  shopify_collection_id text not null unique,
  title text not null,
  handle text not null,
  image_url text,
  shopify_updated_at timestamptz,
  shopify_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.department_shopify_collections (
  department_id uuid not null references public.departments(id) on delete cascade,
  collection_id uuid not null references public.shopify_collections(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, collection_id)
);

create table public.product_shopify_collections (
  product_id uuid not null references public.products(id) on delete cascade,
  collection_id uuid not null references public.shopify_collections(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, collection_id)
);

create index department_shopify_collections_collection_idx
  on public.department_shopify_collections(collection_id);
create index product_shopify_collections_collection_idx
  on public.product_shopify_collections(collection_id);

alter table public.shopify_collections enable row level security;
alter table public.department_shopify_collections enable row level security;
alter table public.product_shopify_collections enable row level security;

create policy shopify_collection_read
on public.shopify_collections for select to authenticated
using (
  exists (
    select 1
    from public.department_shopify_collections assignment
    where assignment.collection_id = shopify_collections.id
      and assignment.department_id = (select private.current_department_id())
  )
);

create policy department_shopify_collection_read
on public.department_shopify_collections for select to authenticated
using (department_id = (select private.current_department_id()));

create policy product_shopify_collection_read
on public.product_shopify_collections for select to authenticated
using (
  exists (
    select 1
    from public.department_shopify_collections assignment
    where assignment.collection_id = product_shopify_collections.collection_id
      and assignment.department_id = (select private.current_department_id())
  )
);

grant select on public.shopify_collections,
  public.department_shopify_collections,
  public.product_shopify_collections to authenticated;

grant select, insert, update, delete on public.shopify_collections,
  public.department_shopify_collections,
  public.product_shopify_collections to service_role;

drop policy product_read on public.products;
create policy product_read
on public.products for select to authenticated
using (
  active = true
  and exists (
    select 1
    from public.product_shopify_collections membership
    join public.department_shopify_collections assignment
      on assignment.collection_id = membership.collection_id
    where membership.product_id = products.id
      and assignment.department_id = (select private.current_department_id())
  )
);
