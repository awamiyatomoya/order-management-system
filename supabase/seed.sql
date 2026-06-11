insert into public.clients (id, name, fbp_fee_rate)
values
  ('00000000-0000-0000-0000-000000000001', 'cocone', 0.08),
  ('00000000-0000-0000-0000-000000000002', 'はぐくみプラス', 0.08)
on conflict (id) do update
set
  name = excluded.name,
  fbp_fee_rate = excluded.fbp_fee_rate;

insert into public.suppliers (id, client_id, name, mapping_key)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'サンプル卸',
    'sample-cosme-wholesale'
  )
on conflict (id) do update
set
  client_id = excluded.client_id,
  name = excluded.name,
  mapping_key = excluded.mapping_key;

insert into public.products (
  client_id,
  jan,
  internal_sku,
  cooola_code,
  name,
  wholesale_price,
  tax_rate,
  retail_price,
  payout_rate,
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
    3780,
    0.5,
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
    2800,
    0.5,
    '{}'::jsonb
  )
on conflict (client_id, jan) do update
set
  internal_sku = excluded.internal_sku,
  cooola_code = excluded.cooola_code,
  name = excluded.name,
  wholesale_price = excluded.wholesale_price,
  tax_rate = excluded.tax_rate,
  retail_price = excluded.retail_price,
  payout_rate = excluded.payout_rate,
  flags = excluded.flags;
