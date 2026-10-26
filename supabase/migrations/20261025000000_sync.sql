-- Generic per-user sync store mirroring the local SQLite layout:
-- one row per record of each array collection, plus scalar meta keys.

create table public.sync_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null check (collection ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  id text not null check (length(id) between 1 and 200),
  data jsonb,
  position double precision not null default 0,
  deleted boolean not null default false,
  client_updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, collection, id),
  check (deleted or data is not null)
);

create table public.sync_meta (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'),
  data jsonb,
  client_updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index sync_records_pull on public.sync_records (user_id, server_updated_at, collection, id);
create index sync_meta_pull on public.sync_meta (user_id, server_updated_at);

-- Server clock drives pull cursors; last write wins on client_updated_at.
create function public.sync_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return null; -- older write loses; keep the newer row
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger sync_records_touch before insert or update on public.sync_records
  for each row execute function public.sync_touch();
create trigger sync_meta_touch before insert or update on public.sync_meta
  for each row execute function public.sync_touch();

alter table public.sync_records enable row level security;
alter table public.sync_meta enable row level security;

create policy "own records" on public.sync_records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own meta" on public.sync_meta
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Private receipt photos stored under receipts/<user_id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

create policy "own receipts read" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own receipts write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own receipts update" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own receipts delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
