-- The project disables automatic exposure of new tables.
-- Server-side actions use the service_role key, so grant explicit table access.

grant usage on schema public to service_role;

grant all on table public.clients to service_role;
grant all on table public.suppliers to service_role;
grant all on table public.products to service_role;
grant all on table public.orders to service_role;
grant all on table public.order_lines to service_role;
grant all on table public.import_batches to service_role;
grant all on table public.import_errors to service_role;

grant usage, select on all sequences in schema public to service_role;
