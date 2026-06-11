-- Expand store-chain aliases for sell-in extraction.
-- Keep sell-in output at chain level, folding regional labels and stock labels into stable names.

insert into public.stores (name, aliases)
select seed.name, seed.aliases
from (
  values
    ('その他', array['その他', '在庫分', 'ザイコブン', 'ザ イコブン', '*ザ イコブン']::text[]),
    ('インキューブ', array['インキューブ', 'INCUBE', '雑貨館インキューブ']::text[]),
    ('イオン', array['イオン', 'AEON', 'イオンスタイル', 'イオンリテール', 'イオンスーパーセンター']::text[]),
    ('イトーヨーカドー', array['イトーヨーカドー', 'ヨーカドー', 'IY', 'Ito Yokado']::text[]),
    ('西友', array['西友', 'SEIYU', 'LIVIN', 'リヴィン']::text[]),
    ('イズミ', array['イズミ', 'ゆめタウン', 'ゆめマート']::text[]),
    ('平和堂', array['平和堂', 'アル・プラザ', 'フレンドマート']::text[]),
    ('京王アートマン', array['京王アートマン', 'アートマン', 'Keio Atman']::text[]),
    ('R.O.U', array['R.O.U', 'ROU', 'アールオーユー']::text[]),
    ('アミング', array['アミング', 'Aming']::text[]),
    ('アフタヌーンティー', array['アフタヌーンティー', 'Afternoon Tea', 'アフタヌーンティー・リビング']::text[]),
    ('ロフト', array['ロフト', 'LOFT']::text[]),
    ('PLAZA', array['PLAZA', 'プラザ', 'MINiPLA', 'ミニプラ']::text[]),
    ('@cosme STORE', array['@cosme STORE', 'アットコスメストア', 'アットコスメ', '@cosme']::text[]),
    ('マツモトキヨシ', array['マツモトキヨシ', 'マツキヨ', 'matsukiyo', 'Matsumoto Kiyoshi']::text[]),
    ('ココカラファイン', array['ココカラファイン', 'cocokara fine']::text[]),
    ('ウエルシア', array['ウエルシア', 'ウェルシア', 'welcia']::text[]),
    ('ツルハドラッグ', array['ツルハドラッグ', 'ツルハ']::text[]),
    ('サンドラッグ', array['サンドラッグ', 'SUNDRUG']::text[]),
    ('スギ薬局', array['スギ薬局', 'スギドラッグ', 'SUGI']::text[]),
    ('コクミンドラッグ', array['コクミンドラッグ', 'コクミン']::text[]),
    ('トモズ', array['トモズ', 'Tomod''s', 'TOMODS']::text[]),
    ('クリエイトSD', array['クリエイトSD', 'クリエイトエス・ディー', 'クリエイトエスディー', 'CREATE SD']::text[]),
    ('セイムス', array['セイムス', 'ドラッグセイムス', 'SEIMS']::text[]),
    ('カワチ薬品', array['カワチ薬品', 'カワチ', 'CAWACHI']::text[]),
    ('クスリのアオキ', array['クスリのアオキ', 'AOKI']::text[]),
    ('ドラッグストアモリ', array['ドラッグストアモリ', 'ドラモリ', 'DRUG STORE MORI']::text[]),
    ('コスモス薬品', array['コスモス薬品', 'ドラッグストアコスモス', 'コスモス']::text[]),
    ('キリン堂', array['キリン堂', 'Kirindo']::text[]),
    ('サツドラ', array['サツドラ', 'サッポロドラッグストアー', 'Satudora']::text[]),
    ('ウォンツ', array['ウォンツ', 'Wants']::text[]),
    ('ザグザグ', array['ザグザグ', 'ZAG ZAG']::text[]),
    ('杏林堂', array['杏林堂', '杏林堂薬局']::text[]),
    ('V・drug', array['V・drug', 'V drug', 'ブイドラッグ']::text[])
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
    ('アインズ', array['アインズ', 'アインズ&トルペ', 'アインズアンドトルペ', 'AINZ', 'AINZ&TULPE']::text[]),
    ('その他', array['その他', '在庫分', 'ザイコブン', 'ザ イコブン', '*ザ イコブン']::text[]),
    ('イオン', array['イオン', 'AEON', 'イオンスタイル', 'イオンリテール', 'イオンスーパーセンター']::text[]),
    ('インキューブ', array['インキューブ', 'INCUBE', '雑貨館インキューブ']::text[])
) as seed(name, aliases)
where public.stores.name = seed.name;

delete from public.stores
where name in ('アインズ&トルペ', 'ザ イコブン', 'ザイコブン');
