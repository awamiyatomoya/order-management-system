-- Seed common Japanese variety-shop and drugstore chains used for sell-in store extraction.
-- Existing OCR-derived candidates are folded into chain-level stores as aliases.

insert into public.stores (name, aliases)
select seed.name, seed.aliases
from (
  values
    ('アインズ', array['アインズ', 'アインズアンドトルペ', 'アインズ&トルペ', 'AINZ', 'AINZ&TULPE', 'アインズ カンサイ', 'アインズ キュウシュウ', 'アインズ カントウ', 'アインズホッカイド ウ', '*アインズ カンサイ', '*アインズ キュウシュウ', '*アインズ カントウ283', '*アインズホッカイド ウ90']::text[]),
    ('ハンズ', array['ハンズ', '東急ハンズ', 'TOKYU HANDS', 'HANDS', 'ハンズ イッセイ', '*ハンズ イッセイ', '*ハンズ イッセイ168', '*ハンズ イッセイ174']::text[]),
    ('ロフト', array['ロフト', 'LOFT', '*ロフトホング', 'ロフトホング']::text[]),
    ('PLAZA', array['PLAZA', 'プラザ', 'MINiPLA', 'ミニプラ']::text[]),
    ('@cosme STORE', array['@cosme STORE', 'アットコスメストア', 'アットコスメ', '@cosme']::text[]),
    ('ショップイン', array['ショップイン', 'shop in', 'shopin']::text[]),
    ('アインズ&トルペ', array['アインズ&トルペ', 'アインズアンドトルペ', 'AINZ&TULPE']::text[]),
    ('マツモトキヨシ', array['マツモトキヨシ', 'マツキヨ', 'matsukiyo', 'Matsumoto Kiyoshi']::text[]),
    ('ココカラファイン', array['ココカラファイン', 'cocokara fine']::text[]),
    ('ウエルシア', array['ウエルシア', 'welcia', 'ウェルシア']::text[]),
    ('ツルハドラッグ', array['ツルハドラッグ', 'ツルハ']::text[]),
    ('サンドラッグ', array['サンドラッグ', 'SUNDRUG']::text[]),
    ('スギ薬局', array['スギ薬局', 'スギドラッグ', 'SUGI']::text[]),
    ('コクミンドラッグ', array['コクミンドラッグ', 'コクミン']::text[]),
    ('トモズ', array['トモズ', 'Tomod''s', 'TOMODS']::text[]),
    ('ドン・キホーテ', array['ドン・キホーテ', 'ドンキ', 'ドンキホーテ', 'MEGAドン・キホーテ', 'メガドンキ', 'メガドン・キホーテ']::text[])
) as seed(name, aliases)
where not exists (
  select 1 from public.stores where lower(public.stores.name) = lower(seed.name)
);

update public.stores
set aliases = (
  select array_agg(distinct alias)
  from unnest(public.stores.aliases || seed.aliases) as alias
)
from (
  values
    ('アインズ', array['アインズ', 'アインズアンドトルペ', 'アインズ&トルペ', 'AINZ', 'AINZ&TULPE', 'アインズ カンサイ', 'アインズ キュウシュウ', 'アインズ カントウ', 'アインズホッカイド ウ', '*アインズ カンサイ', '*アインズ キュウシュウ', '*アインズ カントウ283', '*アインズホッカイド ウ90']::text[]),
    ('ハンズ', array['ハンズ', '東急ハンズ', 'TOKYU HANDS', 'HANDS', 'ハンズ イッセイ', '*ハンズ イッセイ', '*ハンズ イッセイ168', '*ハンズ イッセイ174']::text[]),
    ('ロフト', array['ロフト', 'LOFT', '*ロフトホング', 'ロフトホング']::text[]),
    ('ドン・キホーテ', array['ドン・キホーテ', 'ドンキ', 'ドンキホーテ', 'MEGAドン・キホーテ', 'メガドンキ', 'メガドン・キホーテ', '*メガンプや118,024', 'メガンプや']::text[])
) as seed(name, aliases)
where public.stores.name = seed.name;

delete from public.stores
where name in (
  'アインズ カンサイ',
  'アインズ カントウ',
  'アインズ キュウシュウ',
  'アインズホッカイド ウ',
  'ハンズ イッセイ',
  'ロフトホング',
  'メガンプや'
);
