alter table public.store_introduction_imports
  add column if not exists chain_name text not null default '';

create index if not exists store_introduction_imports_client_chain_idx
  on public.store_introduction_imports (client_id, chain_name);
