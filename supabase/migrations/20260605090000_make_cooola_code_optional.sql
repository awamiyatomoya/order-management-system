alter table public.products
alter column cooola_code drop not null;

alter table public.products
alter column cooola_code set default '';
