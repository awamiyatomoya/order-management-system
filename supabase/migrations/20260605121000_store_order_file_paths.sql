alter table public.orders
add column if not exists source_file_path text;

alter table public.import_batches
add column if not exists file_storage_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-files',
  'order-files',
  false,
  52428800,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;
