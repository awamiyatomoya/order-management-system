alter table public.orders
add column if not exists needs_review boolean not null default false;

alter table public.orders
add column if not exists review_reasons text not null default '';
