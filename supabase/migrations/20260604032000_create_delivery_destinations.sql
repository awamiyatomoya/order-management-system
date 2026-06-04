create table if not exists public.delivery_destinations (
  client_id uuid not null references public.clients(id) on delete restrict,
  code text not null,
  name text not null,
  postal_code text not null default '',
  address1 text not null default '',
  address2 text not null default '',
  address3 text not null default '',
  tel text not null default '',
  aliases text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, code)
);

create index if not exists delivery_destinations_client_id_idx
on public.delivery_destinations(client_id);

create trigger delivery_destinations_set_updated_at
before update on public.delivery_destinations
for each row execute function public.set_updated_at();

alter table public.delivery_destinations enable row level security;

create policy "delivery destinations are scoped by client"
on public.delivery_destinations
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

grant all on table public.delivery_destinations to service_role;
