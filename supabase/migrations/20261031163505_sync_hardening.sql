-- Sync hardening:
-- * A device clock running ahead can't win last-write-wins forever: client
--   times are capped a few minutes past the server clock.
-- * An older write that loses no longer vanishes silently: the stored (newer)
--   row is re-stamped so every device, the sender included, pulls the winner.
-- * Payloads are bounded, and roles keep only the privileges the API needs.

create or replace function public.sync_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.client_updated_at := least(new.client_updated_at, clock_timestamp() + interval '5 minutes');
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    new := old; -- older write loses; re-emit the newer row
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

alter table public.sync_records
  add constraint sync_records_data_size check (pg_column_size(data) <= 65536);
alter table public.sync_meta
  add constraint sync_meta_data_size check (pg_column_size(data) <= 65536);

revoke all on public.sync_records, public.sync_meta from anon;
revoke truncate, references, trigger on public.sync_records, public.sync_meta from authenticated;
