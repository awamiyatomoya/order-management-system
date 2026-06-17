alter table public.products
  add column if not exists unit_volume_unit text;

update public.products
set unit_volume_unit = 'L'
where unit_volume_unit is null
  and unit_volume_l is not null;
