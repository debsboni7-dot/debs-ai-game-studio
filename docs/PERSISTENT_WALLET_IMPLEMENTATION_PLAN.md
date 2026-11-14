# Persistent credit wallet implementation plan

Status: design artifact only. This document is not an applied database migration and does not create or modify production data.

## Deployment gate

The Supabase project currently has no wallet, credit-lot, ledger, reservation, subscription, or payment-event tables. A Supabase development branch could not be created because the connected project is below the Pro plan required for Branching. Do not apply wallet SQL to production as a workaround.

Before any database write:
1. Obtain an isolated Supabase development database (Supabase Branching on Pro, or a separately provisioned development project).
2. Reconcile the repository migration history with the remote project's applied migration history.
3. Review the SQL and RPC contracts below against the actual project schema and PostgreSQL version.
4. Apply migrations only to the isolated development database.
5. Run concurrency, RLS, idempotency, rollback, and integration tests.
6. Obtain explicit approval before deploying schema changes or payment flows to production.

## Data model

All balances are integer credit units. Never use floating-point values for balances or amounts.

### wallet_accounts
- id: UUID primary key
- user_id: UUID, unique per owner
- subscription_balance: BIGINT NOT NULL DEFAULT 0, CHECK >= 0
- purchased_balance: BIGINT NOT NULL DEFAULT 0, CHECK >= 0
- created_at / updated_at: timestamptz

The two balances are kept separate. Subscription grants are spent first. Purchased credits do not expire. Downgrades do not delete either balance.

### credit_lots
Tracks the origin and expiry policy of each grant or purchase.
- id: UUID primary key
- wallet_id: UUID foreign key
- compartment: subscription | purchased
- source_type: subscription_period | pack_purchase | compensation | adjustment
- source_id: text
- original_amount: BIGINT CHECK > 0
- remaining_amount: BIGINT CHECK >= 0
- expires_at: timestamptz nullable
- created_at: timestamptz
- unique(source_type, source_id, wallet_id)

Purchased and replacement credits have no expiry unless applicable law requires otherwise. Subscription lots may have a period-end expiry only if the approved rollover policy changes; the currently approved policy is full rollover.

### credit_ledger
Append-only audit trail. No UPDATE or DELETE privileges for application roles.
- id: UUID primary key
- wallet_id: UUID foreign key
- lot_id: UUID nullable foreign key
- entry_type: grant | purchase | reserve | settle | release | refund | compensation | adjustment
- compartment: subscription | purchased
- delta: BIGINT NOT NULL, non-zero
- idempotency_key: text NOT NULL UNIQUE
- reference_type / reference_id: text
- metadata: jsonb NOT NULL DEFAULT '{}'
- created_at: timestamptz

Corrections are new compensating entries, never edits to historical rows.

### credit_reservations
- id: UUID primary key
- wallet_id: UUID foreign key
- status: reserved | settled | released
- requested_amount: BIGINT CHECK > 0
- subscription_held: BIGINT CHECK >= 0
- purchased_held: BIGINT CHECK >= 0
- settled_amount: BIGINT nullable CHECK >= 0
- idempotency_key: text NOT NULL UNIQUE
- usage_record_id: UUID nullable
- created_at / settled_at / released_at: timestamptz nullable

Reservation, settlement, and release must execute transactionally while locking the wallet row. A reservation may transition only once. Settlement consumes actual usage and releases unused held credits to their original compartments.

### ai_usage_records
- id: UUID primary key
- user_id: UUID NOT NULL
- provider / model: text NOT NULL
- rate_card_version: text NOT NULL
- input_tokens / cached_input_tokens / output_tokens: BIGINT NOT NULL CHECK >= 0
- calculated_credits: BIGINT NOT NULL CHECK >= 0
- request_id: text nullable
- idempotency_key: text NOT NULL UNIQUE
- created_at: timestamptz

Persist the exact rate-card version used for each calculation. Never silently change historical usage when rates change.

### payment_events
- id: UUID primary key
- provider: text NOT NULL
- provider_event_id: text NOT NULL
- event_type: text NOT NULL
- processing_status: received | processed | failed
- payload_digest: text NOT NULL
- processed_at: timestamptz nullable
- created_at: timestamptz
- unique(provider, provider_event_id)

Store only the minimum provider payload needed for audit. Verify webhook signatures before accepting events. Deduplicate provider event IDs and make all resulting wallet grants idempotent.

## Transactional RPC contracts

Implement server-only database functions, not client-side balance writes:

- grant_subscription_credits(user_id, period_id, amount, idempotency_key)
- grant_purchased_credits(user_id, purchase_id, amount, idempotency_key)
- reserve_credits(user_id, amount, idempotency_key)
- settle_reservation(reservation_id, actual_amount, usage_record_id, idempotency_key)
- release_reservation(reservation_id, idempotency_key)
- compensate_credit_purchase(user_id, purchase_id, amount, reason, idempotency_key)

Every function must:
- validate the authenticated user or trusted service role context;
- lock the wallet row before changing balances/lots;
- write immutable ledger entries in the same transaction;
- enforce non-negative balances and lot amounts;
- be safe to retry with the same idempotency key;
- reject reuse of a key with different parameters;
- return a stable result for duplicate requests.

## Security and tests

- Enable RLS on every user-owned table.
- Users may read only their own wallet, lots, ledger, reservations, and usage.
- Deny direct client INSERT/UPDATE/DELETE on wallet balances, lots, ledger, reservations, and payment events.
- Keep service-role credentials and payment secrets server-side.
- Verify webhook signatures and provider event uniqueness before granting credits.
- Test two concurrent reservations against the same balance; the combined reservations must never exceed available credits.
- Test duplicate webhook delivery, duplicate settlement, duplicate release, settlement above reservation, rollback on ledger failure, cross-user access, and refund compensation.
- Do not enable checkout until merchant eligibility in Côte d'Ivoire, payment provider support, fees, tax/legal disclosures, and end-to-end sandbox verification are complete.

## Current product rules represented

- Separate subscription and purchased balances.
- Spend subscription credits before purchased credits.
- Full subscription-credit rollover.
- Purchased credits never expire.
- Downgrades retain all accrued credits.
- No free trial.
- Refund/compensation behavior follows `docs/PAYMENTS_REFUNDS_POLICY.md`.
