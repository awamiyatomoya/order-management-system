-- Let each client define FBP's fee rate and snapshot it on confirmed order lines.
alter table public.clients
  add column if not exists fbp_fee_rate numeric(5, 4) not null default 0.08 check (fbp_fee_rate >= 0);

alter table public.order_lines
  add column if not exists fbp_fee_rate_snapshot numeric(5, 4);

alter table public.order_lines
  drop constraint if exists order_lines_payout_snapshot_complete;

alter table public.order_lines
  add constraint order_lines_payout_snapshot_complete check (
    (
      retail_price_snapshot is null
      and payout_rate_snapshot is null
      and fbp_fee_rate_snapshot is null
      and payout_amount is null
    )
    or
    (
      retail_price_snapshot is not null
      and payout_rate_snapshot is not null
      and fbp_fee_rate_snapshot is not null
      and payout_rate_snapshot > fbp_fee_rate_snapshot
      and payout_amount is not null
      and payout_amount >= 0
    )
  );
