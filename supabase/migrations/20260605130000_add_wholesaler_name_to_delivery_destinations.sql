alter table public.delivery_destinations
add column if not exists wholesaler_name text not null default '';
