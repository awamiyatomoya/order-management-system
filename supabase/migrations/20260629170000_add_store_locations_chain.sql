alter table public.store_locations
  add column if not exists chain_name text not null default '';

create index if not exists store_locations_chain_name_idx
  on public.store_locations (chain_name);

update public.store_locations
set chain_name = 'ロフト'
where chain_name = ''
  and (
    store_code like 'loft-%'
    or store_name ilike '%ロフト%'
    or store_name ilike '%loft%'
  );
