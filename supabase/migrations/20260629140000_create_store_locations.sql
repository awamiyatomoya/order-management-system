create table if not exists public.store_locations (
  store_code text primary key,
  store_name text not null,
  postal_code text not null default '',
  address text not null default '',
  tel text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_locations_name_lower_idx
on public.store_locations (lower(store_name));

create trigger store_locations_set_updated_at
before update on public.store_locations
for each row execute function public.set_updated_at();

alter table public.store_locations enable row level security;

create policy "store locations are readable"
on public.store_locations
for select
using (true);

grant all on table public.store_locations to service_role;
