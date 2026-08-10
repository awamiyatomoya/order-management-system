-- ミモザ・アリー合同の依頼書ではアリー店舗もミモザチェーンとして集計する

update public.stores
set aliases = (
  select array_agg(distinct alias)
  from unnest(
    coalesce(public.stores.aliases, '{}'::text[]) ||
    array['アリー', 'AREE', 'あれー']::text[]
  ) as alias
)
where name = 'ミモザ';
