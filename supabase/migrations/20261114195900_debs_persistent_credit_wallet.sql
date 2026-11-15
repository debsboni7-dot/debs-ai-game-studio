-- Persistent DEBS credit wallet foundation.
-- Applied only to the isolated debs-ai-billing-dev project during development.
-- Wallet mutations are intentionally unavailable until reviewed transactional RPCs are added.

create type public.debs_credit_compartment as enum ('subscription', 'purchased');
create type public.debs_credit_lot_source as enum (
  'subscription_period', 'pack_purchase', 'compensation', 'adjustment'
);
create type public.debs_credit_reservation_status as enum ('reserved', 'settled', 'released');
create type public.debs_credit_ledger_entry_type as enum (
  'subscription_grant', 'purchase_grant', 'reserve', 'settle',
  'release', 'refund', 'compensation', 'adjustment'
);

create table public.debs_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  subscription_balance bigint not null default 0 check (subscription_balance >= 0),
  purchased_balance bigint not null default 0 check (purchased_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.debs_credit_lots (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.debs_wallets(id) on delete restrict,
  compartment public.debs_credit_compartment not null,
  source public.debs_credit_lot_source not null,
  source_reference text not null check (length(btrim(source_reference)) between 1 and 200),
  granted_amount bigint not null check (granted_amount > 0),
  remaining_amount bigint not null check (remaining_amount >= 0 and remaining_amount <= granted_amount),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (wallet_id, source, source_reference),
  check (compartment <> 'purchased' or expires_at is null)
);

create index debs_credit_lots_wallet_compartment_idx
  on public.debs_credit_lots(wallet_id, compartment, created_at, id);

create table public.debs_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.debs_wallets(id) on delete restrict,
  lot_id uuid references public.debs_credit_lots(id) on delete restrict,
  compartment public.debs_credit_compartment not null,
  entry_type public.debs_credit_ledger_entry_type not null,
  delta bigint not null check (delta <> 0),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 1 and 200),
  reference_type text,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index debs_credit_ledger_wallet_created_idx
  on public.debs_credit_ledger(wallet_id, created_at desc, id);

create table public.debs_ai_usage_records (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.debs_wallets(id) on delete restrict,
  provider text not null,
  model text not null,
  rate_card_version text not null,
  input_tokens bigint not null check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0
    check (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens),
  output_tokens bigint not null check (output_tokens >= 0),
  calculated_credits bigint not null check (calculated_credits >= 0),
  provider_request_id text,
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 1 and 200),
  created_at timestamptz not null default now()
);

create index debs_ai_usage_wallet_created_idx
  on public.debs_ai_usage_records(wallet_id, created_at desc);

create table public.debs_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.debs_wallets(id) on delete restrict,
  status public.debs_credit_reservation_status not null default 'reserved',
  requested_amount bigint not null check (requested_amount > 0),
  subscription_held bigint not null check (subscription_held >= 0),
  purchased_held bigint not null check (purchased_held >= 0),
  settled_amount bigint check (settled_amount >= 0),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 1 and 200),
  usage_record_id uuid references public.debs_ai_usage_records(id) on delete restrict,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  released_at timestamptz,
  check (subscription_held + purchased_held = requested_amount),
  check (
    (status = 'reserved' and settled_amount is null and settled_at is null and released_at is null)
    or (status = 'settled' and settled_amount is not null and settled_at is not null and released_at is null)
    or (status = 'released' and settled_amount is null and settled_at is null and released_at is not null)
  )
);

create index debs_credit_reservations_wallet_status_idx
  on public.debs_credit_reservations(wallet_id, status, created_at desc);

create table public.debs_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'failed')),
  payload_digest text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index debs_payment_events_status_created_idx
  on public.debs_payment_events(processing_status, created_at);

-- Owner reads only. All writes remain server-side until transactional RPCs exist.
alter table public.debs_wallets enable row level security;
alter table public.debs_credit_lots enable row level security;
alter table public.debs_credit_ledger enable row level security;
alter table public.debs_credit_reservations enable row level security;
alter table public.debs_ai_usage_records enable row level security;
alter table public.debs_payment_events enable row level security;

create policy "wallet owner can read own wallet"
  on public.debs_wallets for select to authenticated
  using (user_id = (select auth.uid()));

create policy "wallet owner can read own lots"
  on public.debs_credit_lots for select to authenticated
  using (exists (
    select 1 from public.debs_wallets w
    where w.id = wallet_id and w.user_id = (select auth.uid())
  ));

create policy "wallet owner can read own ledger"
  on public.debs_credit_ledger for select to authenticated
  using (exists (
    select 1 from public.debs_wallets w
    where w.id = wallet_id and w.user_id = (select auth.uid())
  ));

create policy "wallet owner can read own reservations"
  on public.debs_credit_reservations for select to authenticated
  using (exists (
    select 1 from public.debs_wallets w
    where w.id = wallet_id and w.user_id = (select auth.uid())
  ));

create policy "wallet owner can read own usage"
  on public.debs_ai_usage_records for select to authenticated
  using (exists (
    select 1 from public.debs_wallets w
    where w.id = wallet_id and w.user_id = (select auth.uid())
  ));

-- Payment events have no authenticated policy and no authenticated table grant.

create or replace function public.debs_reject_credit_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'debs_credit_ledger is append-only';
end;
$$;

create trigger debs_credit_ledger_append_only
  before update or delete on public.debs_credit_ledger
  for each row execute function public.debs_reject_credit_ledger_mutation();

revoke all on table public.debs_wallets, public.debs_credit_lots,
  public.debs_credit_ledger, public.debs_credit_reservations,
  public.debs_ai_usage_records, public.debs_payment_events
  from public, anon, authenticated;

grant select on table public.debs_wallets, public.debs_credit_lots,
  public.debs_credit_ledger, public.debs_credit_reservations,
  public.debs_ai_usage_records to authenticated;

grant all privileges on table public.debs_wallets, public.debs_credit_lots,
  public.debs_credit_reservations, public.debs_ai_usage_records,
  public.debs_payment_events to service_role;

-- Service role may append ledger rows but cannot rewrite or erase history.
grant select, insert on table public.debs_credit_ledger to service_role;
revoke update, delete, truncate on table public.debs_credit_ledger from service_role;
