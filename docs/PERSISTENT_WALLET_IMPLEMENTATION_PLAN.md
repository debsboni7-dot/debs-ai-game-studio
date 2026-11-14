# Persistent credit wallet implementation plan

## Current implementation status

The isolated Supabase development project `debs-ai-billing-dev` (project ID `qkxecdydyeknvgspvsff`, region `eu-west-3`) is active and separate from production.

The six existing repository migrations were applied to this clean development project in order. Their remote version values were reconciled to the six repository filename timestamps. Seven wallet migrations were then applied and verified:

- `20261114195900_debs_persistent_credit_wallet.sql`
- `20261114201000_debs_wallet_privilege_hardening.sql`
- `20261114201500_debs_wallet_policy_and_indexes.sql`
- `20261114202000_debs_wallet_provenance_guards.sql`
- `20261114203000_debs_transactional_credit_operations.sql`
- `20261114203100_debs_reservation_lot_security.sql`
- `20261114203200_debs_reservation_lot_deny_client.sql`

The schema creates separate subscription and purchased balances, credit lots, an append-only ledger, reservations, reservation-to-lot allocations, AI usage records, and server-only payment events. RLS is enabled on all wallet tables. Browser roles cannot write financial data or read payment events/reservation allocations. RPC execution is granted only to `service_role`. Triggers protect ledger history, wallet ownership, and credit-lot provenance.

### Transactional RPCs implemented

- `grant_subscription_credits`: creates an idempotent subscription grant and lot.
- `grant_purchased_credits`: creates an idempotent purchased-credit grant.
- `grant_compensation_credits`: grants non-expiring replacement/store credits.
- `reserve_credits`: locks the wallet, reserves subscription credits first, then purchased credits, and records exact lot allocations without debiting the wallet.
- `settle_credit_reservation`: consumes actual usage from the reserved compartments, updates lots and balances atomically, and releases unused allocations to their original lots.
- `release_credit_reservation`: releases a pending reservation without changing wallet balances.

Each operation is a server-only security-definer function with a fixed search path. Balance-changing operations lock the wallet row. Idempotency keys are unique; changed parameters on a retry are rejected. Reservation allocations are server-only. Reserve/release ledger rows have zero balance delta; settlement rows record the actual debit.

### Development test results

A transactional test script ran in a database transaction and was rolled back after completion. It verified:
- subscription and purchased grants;
- duplicate subscription grant returns the original result;
- subscription credits are reserved before purchased credits;
- settling 900 from a 1,200-credit reservation leaves the correct balances;
- releasing a reservation does not change balances;
- duplicate settlement and release are idempotent;
- insufficient balance and changed idempotency parameters are rejected;
- ledger mutation and lot-provenance mutation are rejected;
- authenticated role cannot invoke service-only grant RPCs.

The database was checked afterward: zero wallet, lot, ledger, reservation, allocation, or usage test rows remain.

Supabase security advisor reports no wallet-specific security findings. Remaining search-path warnings concern two pre-existing baseline functions. Remaining performance findings concern pre-existing tables/policies and unused indexes on this fresh, nearly empty development database.

This is now a **transactional wallet backend foundation**, but it is not yet connected to the app's chat usage path or payment provider. Concurrency tests across simultaneous database sessions, authenticated-JWT owner isolation tests, webhook verification, subscriptions, invoices, and checkout remain incomplete. Checkout remains disabled.

## Deployment and safety gates

1. Keep all development schema work in the isolated development project.
2. Never apply wallet changes directly to production as a development shortcut.
3. Reconcile repository and remote migration histories before further migration work.
4. Every balance-changing operation must be one PostgreSQL transaction and lock the wallet row with `SELECT ... FOR UPDATE`.
5. All write functions must be server-authorized and idempotent. Reusing a key with different parameters must fail.
6. Browser clients must never write balances, lots, reservations, usage facts, payment events, or ledger entries directly.
7. Complete concurrency, RLS/JWT isolation, idempotency, rollback, append-only ledger, and payment-event replay tests before production.
8. Production schema deployment and payment activation require explicit user approval after test evidence and a rollback plan.

## Product rules

- Separate subscription and purchased credit balances.
- Spend subscription credits before purchased credits.
- Full subscription-credit rollover.
- Purchased credits and replacement credits do not expire, subject to applicable law.
- Downgrades retain all accumulated credits.
- No free trial.
- Refund and compensation behavior follows `docs/PAYMENTS_REFUNDS_POLICY.md`.

## Remaining implementation phases

1. Add multi-session concurrency and authenticated-JWT RLS integration tests.
2. Connect the server-only RPCs to the app's AI usage path and the versioned usage meter.
3. Add subscription records, invoice records, and subscription lifecycle synchronization.
4. Add payment provider adapter, webhook signature verification, event reconciliation, and refund/compensation workflow.
5. Verify merchant eligibility in Côte d'Ivoire, provider fees, legal/tax disclosures, and sandbox payment flow.
6. Only after explicit approval, plan production migration and checkout activation with rollback steps.
