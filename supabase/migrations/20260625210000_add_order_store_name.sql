alter table public.orders
add column if not exists store_name text not null default '';
