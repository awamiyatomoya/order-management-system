insert into public.clients (id, name)
values
  ('00000000-0000-0000-0000-000000000001', 'cocone'),
  ('00000000-0000-0000-0000-000000000002', 'はぐくみプラス')
on conflict (id) do update set name = excluded.name;

insert into public.suppliers (id, client_id, name, mapping_key)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'サンプル卸',
    'sample-cosme-wholesale'
  )
on conflict (client_id, mapping_key) do update set name = excluded.name;

insert into public.products (
  client_id,
  jan,
  internal_sku,
  cooola_code,
  name,
  wholesale_price,
  tax_rate,
  flags
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    '4900000000011',
    'COCONE-SHM-001',
    'cocone_shampoo_001',
    'cocone クレイクリームシャンプー',
    1800,
    0.1,
    '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '4900000000028',
    'COCONE-TRT-001',
    'cocone_treatment_001',
    'cocone モイスチャートリートメント',
    1200,
    0.1,
    '{}'::jsonb
  )
on conflict (client_id, jan) do update
set
  internal_sku = excluded.internal_sku,
  cooola_code = excluded.cooola_code,
  name = excluded.name,
  wholesale_price = excluded.wholesale_price,
  tax_rate = excluded.tax_rate,
  flags = excluded.flags;
