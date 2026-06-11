-- Normalize OCR-derived Mimosa candidates to the formal chain name.

insert into public.stores (name, aliases)
select 'ミモザ', array['ミモザ', 'イナイミモザ', '*イナイミモザ', '*イナイミモザ 78']::text[]
where not exists (
  select 1 from public.stores where name = 'ミモザ'
);

update public.stores
set aliases = (
  select array_agg(distinct alias)
  from unnest(
    public.stores.aliases ||
    array['ミモザ', 'イナイミモザ', '*イナイミモザ', '*イナイミモザ 78']::text[] ||
    coalesce((select aliases from public.stores where name = 'イナイミモザ'), '{}'::text[])
  ) as alias
)
where name = 'ミモザ';

delete from public.stores
where name = 'イナイミモザ';
