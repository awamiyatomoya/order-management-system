create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stores_name_lower_key
on public.stores (lower(name));

create trigger set_stores_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

alter table public.stores enable row level security;

create policy "stores are readable"
on public.stores
for select
using (true);

grant all on table public.stores to service_role;
