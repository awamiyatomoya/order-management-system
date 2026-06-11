-- Store client payout terms on products and snapshot them on confirmed order lines.
alter table public.products
  add column if not exists retail_price numeric(12, 2) check (retail_price is null or retail_price >= 0),
  add column if not exists payout_rate numeric(5, 4) check (payout_rate is null or payout_rate > 0.08);

alter table public.order_lines
  add column if not exists retail_price_snapshot numeric(12, 2),
  add column if not exists payout_rate_snapshot numeric(5, 4),
  add column if not exists payout_amount numeric(12, 2);

alter table public.order_lines
  add constraint order_lines_payout_snapshot_complete check (
    (
      retail_price_snapshot is null
      and payout_rate_snapshot is null
      and payout_amount is null
    )
    or
    (
      retail_price_snapshot is not null
      and payout_rate_snapshot is not null
      and payout_rate_snapshot > 0.08
      and payout_amount is not null
      and payout_amount >= 0
    )
  );
