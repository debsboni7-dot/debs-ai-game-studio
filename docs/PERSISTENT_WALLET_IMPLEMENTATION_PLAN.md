# Persistent credit wallet implementation plan

## Current implementation status

The isolated Supabase development project `debs-ai-billing-dev` (project ID `qkxecdydyeknvgspvsff`, region `eu-west-3`) is active. It is separate from production.

The six existing repository migrations were applied to this clean development project in order. The Supabase migration-history versions were reconciled to the six repository filename timestamps, then the wallet migrations below were applied and verified:

- `20261114195900_debs_persistent_credit_wallet.sql`
- `20261114201000_debs_wallet_privilege_hardening.sql`

All six wallet tables have RLS enabled. Authenticated users have read-only table privileges; row ownership is enforced by RLS. Payment events have no authenticated access. The ledger is append-only and the service role cannot update, delete, or truncate it. Usage records are immutable after insertion for the service role. Financial rows cannot be deleted by the service role.

This is a **schema foundation, not yet an operational wallet**. There are no transactional credit RPCs, payment provider adapter, verified webhook, subscription synchronizer, or checkout. Do not activate checkout or treat database balances as usable product credits yet.

## Deployment and safety gates

1. Keep all development schema work in the isolated development project.
2. Never apply wallet changes directly to production as a shortcut.
3. Reconcile repository and remote migration histories before further migration work.
4. Every balance-changing operation must be a single PostgreSQL transaction, lock the wallet row with `SELECT ... FOR UPDATE`, and write lots, balances, and ledger entries atomically.
5. All write functions must be server-authorized and idempotent. Reusing a key with different parameters must fail.
6. Browser clients must never write balances, lots, reservations, usage facts, payment events, or ledger entries directly.
7. Test RLS isolation, concurrent reservations, idempotency, rollback, append-only ledger behavior, and payment-event replay before production.
8. Production schema deployment and payment activation require explicit user approval after test evidence and a rollback plan.

## Product rules

- Separate subscription and purchased credit balances.
- Spend subscription credits before purchased credits.
- Full subscription-credit rollover.
- Purchased credits and replacement credits do not expire, subject to applicable law.
- Downgrades retain all accumulated credits.
- No free trial.
- Refund and compensation behavior follows `docs/PAYMENTS_REFUNDS_POLICY.md`.

## Database model

The executable schema is in `supabase/migrations/`. It creates:

- `debs_wallets`: one wallet per authenticated user, with separate integer balances.
- `debs_credit_lots`: origin and remaining amount for each grant or purchase.
- `debs_credit_ledger`: immutable audit entries with unique idempotency keys.
- `debs_credit_reservations`: held subscription and purchased amounts.
- `debs_ai_usage_records`: provider/model usage with the exact rate-card version.
- `debs_payment_events`: deduplicated provider events, server-only.

All credit values are integer units. Never use floating-point values for balances or amounts.

## Next implementation phase: transactional RPCs

Implement and test server-only database functions:

- `grant_subscription_credits(user_id, period_id, amount, idempotency_key)`
- `grant_purchased_credits(user_id, purchase_id, amount, idempotency_key)`
- `reserve_credits(user_id, amount, idempotency_key)`
- `settle_reservation(reservation_id, actual_amount, usage_record_id, idempotency_key)`
- `release_reservation(reservation_id, idempotency_key)`
- `compensate_credit_purchase(user_id, purchase_id, amount, reason, idempotency_key)`

Each function must validate the authenticated user or trusted service-role context, lock the wallet row, enforce non-negative balances, update the original credit compartments, append ledger entries in the same transaction, and return stable results on safe retries.

## Required tests

1. New wallet creation and owner isolation.
2. Full rollover across multiple subscription grants.
3. Downgrade preserves accumulated credits.
4. Purchased credits never expire.
5. Subscription credits are consumed before purchased credits.
6. Concurrent reservations cannot overdraw a wallet.
7. Duplicate subscription grants and payment events cannot double-credit.
8. Reusing an idempotency key with changed parameters fails.
9. Settlement releases unused credits to their original compartments.
10. Duplicate settlement/release and settlement after release fail safely.
11. Cross-user reads and writes are denied by RLS and RPC authorization.
12. Ledger-write failure rolls back all balance and lot changes.
13. Invalid payment signature, amount, currency, product, or merchant is rejected.
14. Refunds and compensations append entries without rewriting history.

## Remaining gaps

The current schema does not yet implement the transactional RPCs above, subscription records, invoices, persisted rate-card administration, provider adapters, webhook signature verification, reconciliation jobs, or end-to-end payment tests. The wallet is not yet connected to the chat usage path. Checkout must remain disabled until these pieces and legal/provider checks are complete.
