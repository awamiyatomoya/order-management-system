-- Initial schema for the B2B order management MVP.
-- The app starts as an internal tool, but every business table already carries
-- client_id so client login/RLS can be enabled later without reshaping data.

create extension if not exists pgcrypto;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  name text not null,
  mapping_key text not null,
  created_at timestamptz not null default now(),
  unique (client_id, id),
  unique (client_id, mapping_key)
);

create table public.products (
  client_id uuid not null references public.clients(id) on delete restrict,
  jan text not null,
  internal_sku text not null default '',
  cooola_code text not null,
  name text not null,
  wholesale_price numeric(12, 2) not null check (wholesale_price >= 0),
  tax_rate numeric(5, 4) not null check (tax_rate >= 0),
  flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, jan)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  supplier_id uuid not null,
  order_no text not null,
  order_date date not null,
  arrival_due_date date,
  delivery_due_date date,
  ship_to_name text not null,
  ship_to_center text not null default '',
  ship_to_address text not null default '',
  ship_to_tel text not null default '',
  warehouse text not null default '',
  status text not null default 'imported' check (
    status in ('imported', 'confirmed', 'shipping_instructed', 'shipped')
  ),
  source_file text not null default '',
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, supplier_id) references public.suppliers(client_id, id) on delete restrict,
  unique (client_id, id),
  unique (client_id, supplier_id, order_no)
);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  order_id uuid not null,
  line_no int not null check (line_no > 0),
  jan text not null,
  qty int not null check (qty > 0),
  qty_case int,
  qty_loose int,
  unit_price_snapshot numeric(12, 2),
  tax_rate_snapshot numeric(5, 4),
  amount numeric(12, 2),
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, order_id) references public.orders(client_id, id) on delete cascade,
  foreign key (client_id, jan) references public.products(client_id, jan) on delete restrict,
  unique (client_id, order_id, line_no),
  check (
    (unit_price_snapshot is null and tax_rate_snapshot is null and amount is null)
    or
    (unit_price_snapshot is not null and tax_rate_snapshot is not null and amount is not null)
  )
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  supplier_id uuid not null,
  file_name text not null,
  status text not null check (status in ('saved', 'blocked')),
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (client_id, supplier_id) references public.suppliers(client_id, id) on delete restrict,
  unique (client_id, id)
);

create table public.import_errors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  import_batch_id uuid not null,
  row_number int,
  field text not null,
  message text not null,
  created_at timestamptz not null default now(),
  foreign key (client_id, import_batch_id) references public.import_batches(client_id, id) on delete cascade
);

create index suppliers_client_id_idx on public.suppliers(client_id);
create index products_client_id_idx on public.products(client_id);
create index orders_client_id_status_idx on public.orders(client_id, status);
create index orders_client_id_supplier_order_no_idx on public.orders(client_id, supplier_id, order_no);
create index order_lines_client_id_order_id_idx on public.order_lines(client_id, order_id);
create index import_batches_client_id_imported_at_idx on public.import_batches(client_id, imported_at desc);
create index import_errors_client_id_batch_idx on public.import_errors(client_id, import_batch_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create trigger order_lines_set_updated_at
before update on public.order_lines
for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_errors enable row level security;

-- Future client login policy.
-- For MVP, server-side code can use the Supabase service role key.
-- When client login is enabled, put the user's client_id in app_metadata.client_id.
create or replace function public.current_client_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'client_id', '')::uuid;
$$;

create policy "clients are visible to their own users"
on public.clients
for select
using (id = public.current_client_id());

create policy "suppliers are scoped by client"
on public.suppliers
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

create policy "products are scoped by client"
on public.products
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

create policy "orders are scoped by client"
on public.orders
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

create policy "order lines are scoped by client"
on public.order_lines
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

create policy "import batches are scoped by client"
on public.import_batches
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

create policy "import errors are scoped by client"
on public.import_errors
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());
