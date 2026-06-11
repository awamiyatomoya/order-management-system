-- Correct store-chain candidates based on current business scope.

update public.stores
set aliases = (
  select array_agg(distinct alias)
  from unnest(public.stores.aliases || array['ロフト', 'LOFT', '*ロフトホング', 'ロフトホング']::text[]) as alias
)
where name = 'ロフト';

delete from public.stores
where name in ('V・drug', 'V drug', 'ブイドラッグ');
