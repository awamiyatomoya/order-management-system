alter table public.import_batches
  add column if not exists operator_name text;

alter table public.orders
  add column if not exists checked_by_name text,
  add column if not exists shipped_by_name text;
