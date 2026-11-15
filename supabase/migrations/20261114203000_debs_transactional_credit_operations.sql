-- Transactional credit operations. All functions are service-role only.
-- Reservations hold availability without debiting the wallet until settlement.

alter table public.debs_credit_ledger
  drop constraint debs_credit_ledger_delta_check;
alter table public.debs_credit_ledger
  add constraint debs_credit_ledger_delta_check
  check (delta <> 0 or entry_type in ('reserve', 'release'));

alter table public.debs_credit_reservations
  add column settlement_idempotency_key text unique,
  add column release_idempotency_key text unique;

create table public.debs_credit_reservation_lots (
  reservation_id uuid not null references public.debs_credit_reservations(id) on delete restrict,
  lot_id uuid not null references public.debs_credit_lots(id) on delete restrict,
  compartment public.debs_credit_compartment not null,
  held_amount bigint not null check (held_amount > 0),
  consumed_amount bigint not null default 0 check (consumed_amount >= 0),
  released_amount bigint not null default 0 check (released_amount >= 0),
  primary key (reservation_id, lot_id),
  check (consumed_amount + released_amount <= held_amount)
);

create index debs_credit_reservation_lots_lot_idx
  on public.debs_credit_reservation_lots(lot_id);

create or replace function public.debs_get_or_create_wallet(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_wallet_id uuid;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;
  insert into public.debs_wallets(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  select id into v_wallet_id
  from public.debs_wallets
  where user_id = p_user_id
  for update;
  if v_wallet_id is null then
    raise exception 'Unable to resolve wallet';
  end if;
  return v_wallet_id;
end;
$$;

create or replace function public.grant_subscription_credits(
  p_user_id uuid,
  p_period_id text,
  p_amount bigint,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_wallet_id uuid;
  v_lot_id uuid;
  v_entry_id uuid;
  v_existing public.debs_credit_ledger%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if p_amount is null or p_amount <= 0
    or p_period_id is null or length(btrim(p_period_id)) not between 1 and 200
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 150 then
    raise exception 'Invalid subscription grant parameters';
  end if;

  v_wallet_id := public.debs_get_or_create_wallet(p_user_id);
  select * into v_existing from public.debs_credit_ledger
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.wallet_id <> v_wallet_id
      or v_existing.compartment <> 'subscription'
      or v_existing.entry_type <> 'subscription_grant'
      or v_existing.delta <> p_amount
      or v_existing.reference_type <> 'subscription_period'
      or v_existing.reference_id <> p_period_id then
      raise exception 'Idempotency key was already used with different parameters';
    end if;
    return v_existing.id;
  end if;

  insert into public.debs_credit_lots(
    wallet_id, compartment, source, source_reference, granted_amount, remaining_amount
  ) values (
    v_wallet_id, 'subscription', 'subscription_period', p_period_id, p_amount, p_amount
  ) on conflict (wallet_id, source, source_reference) do nothing
  returning id into v_lot_id;
  if v_lot_id is null then
    raise exception 'Subscription period already has a credit lot without this ledger entry';
  end if;

  update public.debs_wallets
  set subscription_balance = subscription_balance + p_amount, updated_at = now()
  where id = v_wallet_id;

  insert into public.debs_credit_ledger(
    wallet_id, lot_id, compartment, entry_type, delta, idempotency_key, reference_type, reference_id
  ) values (
    v_wallet_id, v_lot_id, 'subscription', 'subscription_grant', p_amount,
    p_idempotency_key, 'subscription_period', p_period_id
  ) returning id into v_entry_id;
  return v_entry_id;
end;
$$;

create or replace function public.grant_purchased_credits(
  p_user_id uuid,
  p_purchase_id text,
  p_amount bigint,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_wallet_id uuid;
  v_lot_id uuid;
  v_entry_id uuid;
  v_existing public.debs_credit_ledger%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if p_amount is null or p_amount <= 0
    or p_purchase_id is null or length(btrim(p_purchase_id)) not between 1 and 200
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 150 then
    raise exception 'Invalid purchased credit grant parameters';
  end if;

  v_wallet_id := public.debs_get_or_create_wallet(p_user_id);
  select * into v_existing from public.debs_credit_ledger
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.wallet_id <> v_wallet_id
      or v_existing.compartment <> 'purchased'
      or v_existing.entry_type <> 'purchase_grant'
      or v_existing.delta <> p_amount
      or v_existing.reference_type <> 'purchase'
      or v_existing.reference_id <> p_purchase_id then
      raise exception 'Idempotency key was already used with different parameters';
    end if;
    return v_existing.id;
  end if;

  insert into public.debs_credit_lots(
    wallet_id, compartment, source, source_reference, granted_amount, remaining_amount, expires_at
  ) values (
    v_wallet_id, 'purchased', 'pack_purchase', p_purchase_id, p_amount, p_amount, null
  ) on conflict (wallet_id, source, source_reference) do nothing
  returning id into v_lot_id;
  if v_lot_id is null then
    raise exception 'Purchase already has a credit lot without this ledger entry';
  end if;

  update public.debs_wallets
  set purchased_balance = purchased_balance + p_amount, updated_at = now()
  where id = v_wallet_id;

  insert into public.debs_credit_ledger(
    wallet_id, lot_id, compartment, entry_type, delta, idempotency_key, reference_type, reference_id
  ) values (
    v_wallet_id, v_lot_id, 'purchased', 'purchase_grant', p_amount,
    p_idempotency_key, 'purchase', p_purchase_id
  ) returning id into v_entry_id;
  return v_entry_id;
end;
$$;

create or replace function public.grant_compensation_credits(
  p_user_id uuid,
  p_compensation_id text,
  p_amount bigint,
  p_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_wallet_id uuid;
  v_lot_id uuid;
  v_entry_id uuid;
  v_existing public.debs_credit_ledger%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if p_amount is null or p_amount <= 0
    or p_compensation_id is null or length(btrim(p_compensation_id)) not between 1 and 200
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 150 then
    raise exception 'Invalid compensation parameters';
  end if;

  v_wallet_id := public.debs_get_or_create_wallet(p_user_id);
  select * into v_existing from public.debs_credit_ledger
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.wallet_id <> v_wallet_id
      or v_existing.compartment <> 'purchased'
      or v_existing.entry_type <> 'compensation'
      or v_existing.delta <> p_amount
      or v_existing.reference_type <> 'compensation'
      or v_existing.reference_id <> p_compensation_id then
      raise exception 'Idempotency key was already used with different parameters';
    end if;
    return v_existing.id;
  end if;

  insert into public.debs_credit_lots(
    wallet_id, compartment, source, source_reference, granted_amount, remaining_amount, expires_at
  ) values (
    v_wallet_id, 'purchased', 'compensation', p_compensation_id, p_amount, p_amount, null
  ) on conflict (wallet_id, source, source_reference) do nothing
  returning id into v_lot_id;
  if v_lot_id is null then
    raise exception 'Compensation already has a credit lot without this ledger entry';
  end if;

  update public.debs_wallets
  set purchased_balance = purchased_balance + p_amount, updated_at = now()
  where id = v_wallet_id;

  insert into public.debs_credit_ledger(
    wallet_id, lot_id, compartment, entry_type, delta, idempotency_key,
    reference_type, reference_id, metadata
  ) values (
    v_wallet_id, v_lot_id, 'purchased', 'compensation', p_amount,
    p_idempotency_key, 'compensation', p_compensation_id,
    jsonb_build_object('reason', coalesce(p_reason, ''))
  ) returning id into v_entry_id;
  return v_entry_id;
end;
$$;

create or replace function public.reserve_credits(
  p_user_id uuid,
  p_amount bigint,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_wallet_id uuid;
  v_wallet public.debs_wallets%rowtype;
  v_existing public.debs_credit_reservations%rowtype;
  v_reservation_id uuid;
  v_sub_reserved bigint;
  v_purchase_reserved bigint;
  v_sub_available bigint;
  v_purchase_available bigint;
  v_sub_hold bigint;
  v_purchase_hold bigint;
  v_remaining bigint;
  v_lot record;
  v_take bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if p_amount is null or p_amount <= 0
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 150 then
    raise exception 'Invalid reservation parameters';
  end if;

  v_wallet_id := public.debs_get_or_create_wallet(p_user_id);
  select * into v_wallet from public.debs_wallets where id = v_wallet_id for update;

  select * into v_existing from public.debs_credit_reservations
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.wallet_id <> v_wallet_id or v_existing.requested_amount <> p_amount then
      raise exception 'Idempotency key was already used with different reservation parameters';
    end if;
    return v_existing.id;
  end if;

  select coalesce(sum(rl.held_amount), 0) into v_sub_reserved
  from public.debs_credit_reservation_lots rl
  join public.debs_credit_reservations r on r.id = rl.reservation_id
  where r.wallet_id = v_wallet_id and r.status = 'reserved' and rl.compartment = 'subscription';

  select coalesce(sum(rl.held_amount), 0) into v_purchase_reserved
  from public.debs_credit_reservation_lots rl
  join public.debs_credit_reservations r on r.id = rl.reservation_id
  where r.wallet_id = v_wallet_id and r.status = 'reserved' and rl.compartment = 'purchased';

  v_sub_available := v_wallet.subscription_balance - v_sub_reserved;
  v_purchase_available := v_wallet.purchased_balance - v_purchase_reserved;
  if v_sub_available < 0 or v_purchase_available < 0 then
    raise exception 'Wallet reservation accounting is inconsistent';
  end if;
  if v_sub_available + v_purchase_available < p_amount then
    raise exception 'Insufficient credits';
  end if;

  v_sub_hold := least(p_amount, v_sub_available);
  v_purchase_hold := p_amount - v_sub_hold;

  insert into public.debs_credit_reservations(
    wallet_id, requested_amount, subscription_held, purchased_held, idempotency_key
  ) values (
    v_wallet_id, p_amount, v_sub_hold, v_purchase_hold, p_idempotency_key
  ) returning id into v_reservation_id;

  perform l.id from public.debs_credit_lots l
  where l.wallet_id = v_wallet_id
  order by l.created_at, l.id
  for update;

  v_remaining := v_sub_hold;
  for v_lot in
    select l.id,
      l.remaining_amount - coalesce((
        select sum(rl.held_amount)
        from public.debs_credit_reservation_lots rl
        join public.debs_credit_reservations r on r.id = rl.reservation_id
        where rl.lot_id = l.id and r.status = 'reserved'
      ), 0) as available
    from public.debs_credit_lots l
    where l.wallet_id = v_wallet_id and l.compartment = 'subscription'
    order by l.created_at, l.id
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_lot.available);
    if v_take > 0 then
      insert into public.debs_credit_reservation_lots(reservation_id, lot_id, compartment, held_amount)
      values (v_reservation_id, v_lot.id, 'subscription', v_take);
      v_remaining := v_remaining - v_take;
    end if;
  end loop;
  if v_remaining <> 0 then
    raise exception 'Subscription lot accounting does not match wallet balance';
  end if;

  v_remaining := v_purchase_hold;
  for v_lot in
    select l.id,
      l.remaining_amount - coalesce((
        select sum(rl.held_amount)
        from public.debs_credit_reservation_lots rl
        join public.debs_credit_reservations r on r.id = rl.reservation_id
        where rl.lot_id = l.id and r.status = 'reserved'
      ), 0) as available
    from public.debs_credit_lots l
    where l.wallet_id = v_wallet_id and l.compartment = 'purchased'
    order by l.created_at, l.id
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_lot.available);
    if v_take > 0 then
      insert into public.debs_credit_reservation_lots(reservation_id, lot_id, compartment, held_amount)
      values (v_reservation_id, v_lot.id, 'purchased', v_take);
      v_remaining := v_remaining - v_take;
    end if;
  end loop;
  if v_remaining <> 0 then
    raise exception 'Purchased lot accounting does not match wallet balance';
  end if;

  if v_sub_hold > 0 then
    insert into public.debs_credit_ledger(wallet_id, compartment, entry_type, delta, idempotency_key, reference_type, reference_id, metadata)
    values (v_wallet_id, 'subscription', 'reserve', 0, p_idempotency_key || ':reserve:subscription',
      'reservation', v_reservation_id::text, jsonb_build_object('held_amount', v_sub_hold));
  end if;
  if v_purchase_hold > 0 then
    insert into public.debs_credit_ledger(wallet_id, compartment, entry_type, delta, idempotency_key, reference_type, reference_id, metadata)
    values (v_wallet_id, 'purchased', 'reserve', 0, p_idempotency_key || ':reserve:purchased',
      'reservation', v_reservation_id::text, jsonb_build_object('held_amount', v_purchase_hold));
  end if;
  return v_reservation_id;
end;
$$;

create or replace function public.settle_credit_reservation(
  p_reservation_id uuid,
  p_actual_amount bigint,
  p_usage_record_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_wallet_id uuid;
  v_wallet public.debs_wallets%rowtype;
  v_reservation public.debs_credit_reservations%rowtype;
  v_alloc record;
  v_sub_to_consume bigint;
  v_purchase_to_consume bigint;
  v_consume bigint;
  v_sub_consumed bigint := 0;
  v_purchase_consumed bigint := 0;
  v_sub_released bigint := 0;
  v_purchase_released bigint := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if p_actual_amount is null or p_actual_amount < 0
    or p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 150 then
    raise exception 'Invalid settlement parameters';
  end if;

  select wallet_id into v_wallet_id from public.debs_credit_reservations where id = p_reservation_id;
  if v_wallet_id is null then
    raise exception 'Reservation not found';
  end if;
  select * into v_wallet from public.debs_wallets where id = v_wallet_id for update;
  select * into v_reservation from public.debs_credit_reservations where id = p_reservation_id for update;

  if v_reservation.status = 'settled' then
    if v_reservation.settlement_idempotency_key = p_idempotency_key
      and v_reservation.settled_amount = p_actual_amount
      and v_reservation.usage_record_id is not distinct from p_usage_record_id then
      return v_reservation.id;
    end if;
    raise exception 'Reservation has already been settled with different parameters';
  end if;
  if v_reservation.status <> 'reserved' then
    raise exception 'Only reserved credits can be settled';
  end if;
  if p_actual_amount > v_reservation.requested_amount then
    raise exception 'Actual usage exceeds reserved amount';
  end if;
  if p_usage_record_id is not null and not exists (
    select 1 from public.debs_ai_usage_records u
    where u.id = p_usage_record_id and u.wallet_id = v_wallet_id
  ) then
    raise exception 'Usage record does not belong to this wallet';
  end if;

  v_sub_to_consume := least(p_actual_amount, v_reservation.subscription_held);
  v_purchase_to_consume := p_actual_amount - v_sub_to_consume;

  for v_alloc in
    select rl.reservation_id, rl.lot_id, rl.compartment, rl.held_amount, l.created_at
    from public.debs_credit_reservation_lots rl
    join public.debs_credit_lots l on l.id = rl.lot_id
    where rl.reservation_id = p_reservation_id
    order by case rl.compartment when 'subscription' then 1 else 2 end, l.created_at, l.id
    for update of l
  loop
    if v_alloc.compartment = 'subscription' then
      v_consume := least(v_sub_to_consume, v_alloc.held_amount);
      v_sub_to_consume := v_sub_to_consume - v_consume;
      v_sub_consumed := v_sub_consumed + v_consume;
      v_sub_released := v_sub_released + (v_alloc.held_amount - v_consume);
    else
      v_consume := least(v_purchase_to_consume, v_alloc.held_amount);
      v_purchase_to_consume := v_purchase_to_consume - v_consume;
      v_purchase_consumed := v_purchase_consumed + v_consume;
      v_purchase_released := v_purchase_released + (v_alloc.held_amount - v_consume);
    end if;

    update public.debs_credit_reservation_lots
    set consumed_amount = v_consume, released_amount = held_amount - v_consume
    where reservation_id = p_reservation_id and lot_id = v_alloc.lot_id;

    if v_consume > 0 then
      update public.debs_credit_lots
      set remaining_amount = remaining_amount - v_consume
      where id = v_alloc.lot_id and remaining_amount >= v_consume;
      if not found then
        raise exception 'Credit lot balance is inconsistent';
      end if;
    end if;
  end loop;

  if v_sub_to_consume <> 0 or v_purchase_to_consume <> 0 then
    raise exception 'Reservation lot allocations are incomplete';
  end if;

  update public.debs_wallets
  set subscription_balance = subscription_balance - v_sub_consumed,
      purchased_balance = purchased_balance - v_purchase_consumed,
      updated_at = now()
  where id = v_wallet_id
    and subscription_balance >= v_sub_consumed
    and purchased_balance >= v_purchase_consumed;
  if not found then
    raise exception 'Wallet balance is inconsistent';
  end if;

  if v_sub_consumed > 0 then
    insert into public.debs_credit_ledger(wallet_id, compartment, entry_type, delta, idempotency_key, reference_type, reference_id)
    values (v_wallet_id, 'subscription', 'settle', -v_sub_consumed, p_idempotency_key || ':settle:subscription', 'reservation', p_reservation_id::text);
  end if;
  if v_purchase_consumed > 0 then
    insert into public.debs_credit_ledger(wallet_id, compartment, entry_type, delta, idempotency_key, reference_type, reference_id)
    values (v_wallet_id, 'purchased', 'settle', -v_purchase_consumed, p_idempotency_key || ':settle:purchased', 'reservation', p_reservation_id::text);
  end if;
  if v_sub_released > 0 then
    insert into public.debs_credit_ledger(wallet_id, compartment, entry_type, delta, idempotency_key, reference_type, reference_id, metadata)
    values (v_wallet_id, 'subscription', 'release', 0, p_idempotency_key || ':release:subscription', 'reservation', p_reservation_id::text,
      jsonb_build_object('released_amount', v_sub_released));
  end if;
  if v_purchase_released > 0 then
    insert into public.debs_credit_ledger(wallet_id, compartment, entry_type, delta, idempotency_key, reference_type, reference_id, metadata)
    values (v_wallet_id, 'purchased', 'release', 0, p_idempotency_key || ':release:purchased', 'reservation', p_reservation_id::text,
      jsonb_build_object('released_amount', v_purchase_released));
  end if;

  update public.debs_credit_reservations
  set status = 'settled', settled_amount = p_actual_amount, settled_at = now(),
      usage_record_id = p_usage_record_id, settlement_idempotency_key = p_idempotency_key
  where id = p_reservation_id;
  return p_reservation_id;
end;
$$;

create or replace function public.release_credit_reservation(
  p_reservation_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_wallet_id uuid;
  v_reservation public.debs_credit_reservations%rowtype;
  v_sub_released bigint;
  v_purchase_released bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 1 and 150 then
    raise exception 'Invalid release idempotency key';
  end if;

  select wallet_id into v_wallet_id from public.debs_credit_reservations where id = p_reservation_id;
  if v_wallet_id is null then
    raise exception 'Reservation not found';
  end if;
  perform 1 from public.debs_wallets where id = v_wallet_id for update;
  select * into v_reservation from public.debs_credit_reservations where id = p_reservation_id for update;

  if v_reservation.status = 'released' then
    if v_reservation.release_idempotency_key = p_idempotency_key then
      return v_reservation.id;
    end if;
    raise exception 'Reservation has already been released with a different key';
  end if;
  if v_reservation.status <> 'reserved' then
    raise exception 'Only reserved credits can be released';
  end if;

  select coalesce(sum(held_amount),0) into v_sub_released
  from public.debs_credit_reservation_lots
  where reservation_id = p_reservation_id and compartment = 'subscription';
  select coalesce(sum(held_amount),0) into v_purchase_released
  from public.debs_credit_reservation_lots
  where reservation_id = p_reservation_id and compartment = 'purchased';

  update public.debs_credit_reservation_lots
  set consumed_amount = 0, released_amount = held_amount
  where reservation_id = p_reservation_id;

  if v_sub_released > 0 then
    insert into public.debs_credit_ledger(wallet_id, compartment, entry_type, delta, idempotency_key, reference_type, reference_id, metadata)
    values (v_wallet_id, 'subscription', 'release', 0, p_idempotency_key || ':release:subscription', 'reservation', p_reservation_id::text,
      jsonb_build_object('released_amount', v_sub_released));
  end if;
  if v_purchase_released > 0 then
    insert into public.debs_credit_ledger(wallet_id, compartment, entry_type, delta, idempotency_key, reference_type, reference_id, metadata)
    values (v_wallet_id, 'purchased', 'release', 0, p_idempotency_key || ':release:purchased', 'reservation', p_reservation_id::text,
      jsonb_build_object('released_amount', v_purchase_released));
  end if;

  update public.debs_credit_reservations
  set status = 'released', released_at = now(), release_idempotency_key = p_idempotency_key
  where id = p_reservation_id;
  return p_reservation_id;
end;
$$;

revoke all on function public.debs_get_or_create_wallet(uuid) from public, anon, authenticated, service_role;
revoke all on function public.grant_subscription_credits(uuid,text,bigint,text) from public, anon, authenticated;
revoke all on function public.grant_purchased_credits(uuid,text,bigint,text) from public, anon, authenticated;
revoke all on function public.grant_compensation_credits(uuid,text,bigint,text,text) from public, anon, authenticated;
revoke all on function public.reserve_credits(uuid,bigint,text) from public, anon, authenticated;
revoke all on function public.settle_credit_reservation(uuid,bigint,uuid,text) from public, anon, authenticated;
revoke all on function public.release_credit_reservation(uuid,text) from public, anon, authenticated;

grant execute on function public.grant_subscription_credits(uuid,text,bigint,text) to service_role;
grant execute on function public.grant_purchased_credits(uuid,text,bigint,text) to service_role;
grant execute on function public.grant_compensation_credits(uuid,text,bigint,text,text) to service_role;
grant execute on function public.reserve_credits(uuid,bigint,text) to service_role;
grant execute on function public.settle_credit_reservation(uuid,bigint,uuid,text) to service_role;
grant execute on function public.release_credit_reservation(uuid,text) to service_role;
