create table public.deletion_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  target_type text not null check (target_type in ('order', 'import_batch')),
  target_id uuid,
  order_no text not null default '',
  file_name text not null default '',
  order_status text not null default '',
  line_count integer,
  operator_name text not null,
  deleted_at timestamptz not null default now()
);

create index deletion_logs_client_id_deleted_at_idx
  on public.deletion_logs(client_id, deleted_at desc);

alter table public.deletion_logs enable row level security;

create policy "deletion logs are scoped by client"
on public.deletion_logs
for all
using (client_id = public.current_client_id())
with check (client_id = public.current_client_id());

grant all on table public.deletion_logs to service_role;
