alter table public.products
  add column if not exists csv_export_product_name text;
