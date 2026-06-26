create table if not exists public.store_introduction_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  file_name text not null,
  format_key text not null check (format_key in ('row-list', 'flag-list')),
  imported_at timestamptz not null default now(),
  total_store_count int not null default 0,
  introduced_store_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.store_introduction_entries (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.store_introduction_imports(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  jan text not null,
  product_name text not null default '',
  store_name text not null,
  store_code text not null default '',
  address text not null default '',
  postal_code text not null default '',
  is_introduced boolean not null default true,
  matched_store_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists store_introduction_imports_client_imported_at_idx
  on public.store_introduction_imports (client_id, imported_at desc);

create index if not exists store_introduction_entries_import_id_idx
  on public.store_introduction_entries (import_id);

create index if not exists store_introduction_entries_client_jan_idx
  on public.store_introduction_entries (client_id, jan);

alter table public.store_introduction_imports enable row level security;
alter table public.store_introduction_entries enable row level security;

create policy "store introduction imports are readable"
on public.store_introduction_imports
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

create policy "store introduction entries are readable"
on public.store_introduction_entries
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

grant all on table public.store_introduction_imports to service_role;
grant all on table public.store_introduction_entries to service_role;
