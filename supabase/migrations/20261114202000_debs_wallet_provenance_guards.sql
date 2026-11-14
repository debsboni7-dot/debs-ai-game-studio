-- Prevent mutation of credit-lot provenance and wallet ownership.
create or replace function public.debs_guard_credit_lot_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
    or new.wallet_id is distinct from old.wallet_id
    or new.compartment is distinct from old.compartment
    or new.source is distinct from old.source
    or new.source_reference is distinct from old.source_reference
    or new.granted_amount is distinct from old.granted_amount
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at then
    raise exception 'Credit lot provenance is immutable';
  end if;
  if new.remaining_amount > old.remaining_amount then
    raise exception 'Credit lot remaining amount cannot increase';
  end if;
  return new;
end;
$$;

create trigger debs_credit_lot_provenance_guard
  before update on public.debs_credit_lots
  for each row execute function public.debs_guard_credit_lot_update();

create or replace function public.debs_guard_wallet_owner_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Wallet identity and ownership are immutable';
  end if;
  return new;
end;
$$;

create trigger debs_wallet_owner_guard
  before update on public.debs_wallets
  for each row execute function public.debs_guard_wallet_owner_update();
