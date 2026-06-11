create extension if not exists pg_trgm;

create index if not exists products_jan_idx
on public.products(jan);

create index if not exists products_name_trgm_idx
on public.products
using gin (name gin_trgm_ops);

create index if not exists products_formal_product_name_trgm_idx
on public.products
using gin (formal_product_name gin_trgm_ops);

create index if not exists products_product_name_kana_trgm_idx
on public.products
using gin (product_name_kana gin_trgm_ops);
