-- あらた広島センターは志和町冠67-1（739-0265）へ移転済み。
-- 旧コード 739-0262（志和東小越甲895-348）は誤ってTEL一致だけで紐づいていた。

delete from public.delivery_destinations
where wholesaler_name = 'あらた'
  and code = '739-0262';

insert into public.delivery_destinations (
  wholesaler_name,
  code,
  name,
  postal_code,
  address1,
  address2,
  address3,
  tel,
  aliases
) values (
  'あらた',
  '739-0265',
  '中四国支社 広島センター',
  '739-0265',
  '広島県東広島市志和町冠67-1 MK倉庫',
  '',
  '',
  '082-433-0335',
  array[
    '中四国支社 広島センター',
    '広島センター',
    '広島志和物流センター',
    'あらた 広島センター',
    'アラタ 広島センター',
    'アラタヒロシマヒロシマシワブツリュウセンター',
    'アラタヒロシマヒロシマシワブツリユウセンター',
    '㈱あらた 広島センター',
    '中四国支社広島センター',
    'あらた 中四国支社 広島センター',
    'アラタ 中四国支社 広島センター',
    '広島県東広島市志和町冠67-1',
    '739-0265',
    '7390265'
  ]
)
on conflict (wholesaler_name, code) do update set
  name = excluded.name,
  postal_code = excluded.postal_code,
  address1 = excluded.address1,
  address2 = excluded.address2,
  address3 = excluded.address3,
  tel = excluded.tel,
  aliases = excluded.aliases,
  updated_at = now();
