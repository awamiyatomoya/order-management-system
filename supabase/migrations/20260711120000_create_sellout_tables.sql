create table if not exists public.sellout_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  file_name text not null,
  profile_key text not null,
  retailer text not null default '',
  layout_type text not null,
  period_start date,
  period_end date,
  imported_at timestamptz not null default now(),
  entry_count int not null default 0,
  store_count int not null default 0,
  total_qty int not null default 0,
  total_amount bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sellout_entries (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.sellout_imports(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  period_start date,
  period_end date,
  retailer text not null default '',
  store_code text not null default '',
  store_name text not null default '',
  matched_store_code text not null default '',
  matched_store_name text not null default '',
  jan text not null,
  product_name text not null default '',
  qty int not null default 0,
  amount bigint not null default 0,
  stock int,
  created_at timestamptz not null default now()
);

create index if not exists sellout_imports_client_imported_at_idx
  on public.sellout_imports (client_id, imported_at desc);

create index if not exists sellout_imports_client_retailer_idx
  on public.sellout_imports (client_id, retailer, imported_at desc);

create index if not exists sellout_entries_import_id_idx
  on public.sellout_entries (import_id);

create index if not exists sellout_entries_client_jan_idx
  on public.sellout_entries (client_id, jan);

alter table public.sellout_imports enable row level security;
alter table public.sellout_entries enable row level security;

create policy "sellout imports are readable"
on public.sellout_imports
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

create policy "sellout entries are readable"
on public.sellout_entries
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

grant all on table public.sellout_imports to service_role;
grant all on table public.sellout_entries to service_role;
