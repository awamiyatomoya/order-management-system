-- Delivery destinations are shared across all clients (like stores).
-- Deduplicate rows that were copied per client, then drop client_id.

delete from public.delivery_destinations d
using public.delivery_destinations d2
where d.wholesaler_name = d2.wholesaler_name
  and d.code = d2.code
  and d.ctid > d2.ctid;

drop policy if exists "delivery destinations are scoped by client" on public.delivery_destinations;

alter table public.delivery_destinations
drop constraint if exists delivery_destinations_pkey;

alter table public.delivery_destinations
drop constraint if exists delivery_destinations_client_id_fkey;

drop index if exists public.delivery_destinations_client_id_idx;

alter table public.delivery_destinations
drop column if exists client_id;

alter table public.delivery_destinations
add primary key (wholesaler_name, code);

create policy "delivery destinations are readable"
on public.delivery_destinations
for select
using (true);
