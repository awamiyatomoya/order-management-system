alter table public.suppliers
drop constraint if exists suppliers_client_id_mapping_key_key;

create index if not exists suppliers_client_id_mapping_key_idx
on public.suppliers(client_id, mapping_key);
