-- Provision a zero-balance wallet for each authenticated account.
-- Credit grants remain server-only and require an explicit subscription/compensation policy.

create or replace function public.debs_handle_auth_user_wallet()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.debs_get_or_create_wallet(new.id);
  return new;
end;
$$;

revoke all on function public.debs_handle_auth_user_wallet() from public, anon, authenticated;

drop trigger if exists debs_auth_user_wallet_created on auth.users;
create trigger debs_auth_user_wallet_created
  after insert on auth.users
  for each row execute function public.debs_handle_auth_user_wallet();

-- Backfill accounts that existed before this migration, without granting credits.
insert into public.debs_wallets (user_id)
select id from auth.users
on conflict (user_id) do nothing;
