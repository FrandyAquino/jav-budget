-- In-app account deletion (App Store guideline 5.1.1(v)).
-- The client removes its receipt photos through the Storage API first (direct
-- deletes from storage.objects aren't allowed), then calls this function.
-- sync_records and sync_meta rows cascade from auth.users.
create function public.delete_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
