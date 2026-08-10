alter table public.sellout_imports
  add column if not exists file_storage_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sellout-files',
  'sellout-files',
  false,
  52428800,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do nothing;
