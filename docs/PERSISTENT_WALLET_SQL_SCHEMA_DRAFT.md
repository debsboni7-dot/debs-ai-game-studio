# Persistent wallet SQL schema draft

> **NON-EXECUTABLE DESIGN DRAFT.** This SQL is intentionally stored in documentation, not in `supabase/migrations/`. It has not been applied or validated against a development database. Do not copy it into production. First provision an isolated development database, reconcile migration history, then turn this draft into reviewed migrations and integration tests.

## Design decisions

- Balances are integer credit units, never floating point.
- Subscription and purchased credits are separate compartments.
- Full rollover means subscription lots have no automatic expiry under the currently approved rules.
- Purchased credits and replacement credits do not expire, subject to applicable law.
- Spending order is subscription first, purchased second.
- The wallet row is the serialization lock for every balance-changing transaction.
- Ledger rows are append-only. Corrections are compensating entries.
- Browser clients receive read access only to their own wallet views. All writes are trusted server-side transactions.
- Idempotency keys are unique and retries with different parameters must be rejected.

## Proposed schema (review before migration)

```sql
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
  source_reference text not null,
  granted_amount bigint not null check (granted_amount > 0),
  remaining_amount bigint not null check (
    remaining_amount >= 0 and remaining_amount <= granted_amount
  ),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (wallet_id, source, source_reference),
  check (
    compartment <> 'purchased'
    or expires_at is null
  )
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
  idempotency_key text not null unique,
  reference_type text,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index debs_credit_ledger_wallet_created_idx
  on public.debs_credit_ledger(wallet_id, created_at desc, id);

create table public.debs_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.debs_wallets(id) on delete restrict,
  status public.debs_credit_reservation_status not null default 'reserved',
  requested_amount bigint not null check (requested_amount > 0),
  subscription_held bigint not null check (subscription_held >= 0),
  purchased_held bigint not null check (purchased_held >= 0),
  settled_amount bigint check (settled_amount >= 0),
  idempotency_key text not null unique,
  usage_record_id uuid,
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

create table public.debs_ai_usage_records (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.debs_wallets(id) on delete restrict,
  provider text not null,
  model text not null,
  rate_card_version text not null,
  input_tokens bigint not null check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (
    cached_input_tokens >= 0 and cached_input_tokens <= input_tokens
  ),
  output_tokens bigint not null check (output_tokens >= 0),
  calculated_credits bigint not null check (calculated_credits >= 0),
  provider_request_id text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

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
```

## Security policy draft

The following is a baseline only. Verify it against the actual authentication model and server roles before use.

```sql
alter table public.debs_wallets enable row level security;
alter table public.debs_credit_lots enable row level security;
alter table public.debs_credit_ledger enable row level security;
alter table public.debs_credit_reservations enable row level security;
alter table public.debs_ai_usage_records enable row level security;
alter table public.debs_payment_events enable row level security;

create policy "wallet owner can read own wallet"
  on public.debs_wallets for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "wallet owner can read own lots"
  on public.debs_credit_lots for select
  to authenticated
  using (exists (
    select 1 from public.debs_wallets w
    where w.id = wallet_id and w.user_id = (select auth.uid())
  ));

create policy "wallet owner can read own ledger"
  on public.debs_credit_ledger for select
  to authenticated
  using (exists (
    select 1 from public.debs_wallets w
    where w.id = wallet_id and w.user_id = (select auth.uid())
  ));

create policy "wallet owner can read own reservations"
  on public.debs_credit_reservations for select
  to authenticated
  using (exists (
    select 1 from public.debs_wallets w
    where w.id = wallet_id and w.user_id = (select auth.uid())
  ));

create policy "wallet owner can read own usage"
  on public.debs_ai_usage_records for select
  to authenticated
  using (exists (
    select 1 from public.debs_wallets w
    where w.id = wallet_id and w.user_id = (select auth.uid())
  ));

-- No authenticated-user write policies are defined intentionally.
-- Payment events are server-only and have no client-facing policies.
```

## Required server transaction behavior

Do not implement balance changes as a sequence of independent REST writes. Each operation must be one PostgreSQL transaction and lock the wallet row with `SELECT ... FOR UPDATE`.

### Grant subscription credits

1. Resolve the wallet from the authenticated server-side user ID.
2. Lock the wallet row.
3. Insert a lot with a unique subscription-period reference.
4. If that source reference already exists, compare the stored amount and return the prior result only if parameters match.
5. Increase subscription balance and append a positive ledger entry in the same transaction.

### Grant purchased credits

1. Verify the payment provider webhook signature before entering the grant path.
2. Insert or locate the unique provider event.
3. Verify that the payment is successful, settled, and matches expected amount, currency, product, and merchant account.
4. Lock the wallet row.
5. Insert a purchased lot and increment purchased balance exactly once.
6. Append the purchase ledger entry and mark the provider event processed in the same transaction.

### Reserve and settle usage

- Lock the wallet row before checking availability.
- Deduct from subscription balance first, then purchased balance.
- Record the exact held amount from each compartment.
- Settlement may consume no more than the reservation.
- Release unused credits to the same compartments from which they were reserved.
- A reservation can be settled or released only once.
- Store provider-reported token counts and the exact rate-card version used.
- Reject duplicate idempotency keys with changed parameters.

### Ledger integrity

A later migration must revoke UPDATE and DELETE from application roles on the ledger and payment event tables. A trigger or restricted database role should enforce append-only behavior even if a future grant is accidentally added. Never rely on UI hiding to enforce financial integrity.

## Required tests before any production migration

1. New wallet creation and owner isolation.
2. Full subscription rollover across multiple grants.
3. Downgrade leaves all accumulated credits intact.
4. Purchased credits never expire.
5. Subscription credits are always spent before purchased credits.
6. Two simultaneous reservations cannot overdraw the same wallet.
7. Duplicate subscription grant and duplicate payment webhook do not double-credit.
8. Reusing an idempotency key with different parameters fails.
9. Settlement releases unused amounts to the original compartments.
10. Duplicate settlement, duplicate release, and settlement after release fail safely.
11. Cross-user reads and writes are denied by RLS and RPC authorization.
12. A failure writing the ledger rolls back the balance and lot changes.
13. Payment signature failure, currency mismatch, amount mismatch, and wrong merchant are rejected.
14. Refunds and compensations append new entries and never rewrite history.

## Known gaps

This schema alone is not a working wallet. It does not yet include reviewed RPC implementations, immutable-ledger enforcement triggers, subscription records, invoice records, rate-card storage, payment provider adapters, webhook verification, reconciliation jobs, or an integration test harness. Those must be designed and validated against an isolated database before release.
