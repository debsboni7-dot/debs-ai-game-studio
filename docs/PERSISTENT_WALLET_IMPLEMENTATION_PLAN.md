# Persistent wallet and billing implementation plan

## Current implementation status

The isolated Supabase development project `debs-ai-billing-dev` (project ID `qkxecdydyeknvgspvsff`, region `eu-west-3`) is active and separate from production.

The six existing repository migrations were applied to this clean development project in order. Their remote version values were reconciled to the six repository filename timestamps. Ten wallet/billing migrations were then applied and verified:

- `20261114195900_debs_persistent_credit_wallet.sql`
- `20261114201000_debs_wallet_privilege_hardening.sql`
- `20261114201500_debs_wallet_policy_and_indexes.sql`
- `20261114202000_debs_wallet_provenance_guards.sql`
- `20261114203000_debs_transactional_credit_operations.sql`
- `20261114203100_debs_reservation_lot_security.sql`
- `20261114203200_debs_reservation_lot_deny_client.sql`
- `20261114204000_debs_subscription_and_billing_records.sql`
- `20261114204100_debs_billing_fk_indexes.sql`
- `20261114205000_debs_disable_standalone_credit_purchases.sql`

The schema includes subscription and compensation balances, credit lots, an append-only ledger, reservations and lot allocations, AI usage records, server-only payment events, subscriptions, invoices, plan-price catalog, and versioned AI rate cards.

### Product rule: no standalone credit purchases

The second credit compartment is reserved for compensation/store-credit grants only. Standalone credit top-ups are disabled:
- The purchased-credit grant RPC was dropped.
- Credit-pack catalog and order tables were dropped.
- Legacy enum values for pack purchases and purchase grants were renamed as disabled.
- The legacy database column `purchased_balance` now represents the non-subscription compensation/store-credit balance only. It must not be presented as an option to buy credits.

Subscription credits retain full rollover and accumulated credits remain after downgrade. Compensation/store credits do not expire, subject to applicable law. No price rows or model-rate rows have been seeded: proposed commercial prices and real provider rates must not be treated as approved values.

### Transactional RPCs implemented

- `grant_subscription_credits`: creates an idempotent subscription grant and lot.
- `grant_compensation_credits`: grants non-expiring compensation/store credits.
- `reserve_credits`: locks the wallet, reserves subscription credits first, then compensation credits, and records exact lot allocations without debiting the wallet.
- `settle_credit_reservation`: consumes actual usage from reserved compartments, updates lots and balances atomically, and releases unused allocations to their original lots.
- `release_credit_reservation`: releases a pending reservation without changing wallet balances.

Each operation is a server-only security-definer function with a fixed search path. Balance-changing operations lock the wallet row. Idempotency keys are unique; changed parameters on a retry are rejected. Reservation allocations are server-only. Reserve/release ledger rows have zero balance delta; settlement rows record the actual debit.

### Subscription and pricing schema

- `debs_subscriptions`: provider-neutral subscription state and paid period boundaries.
- `debs_invoices`: invoice amounts, tax, status, and provider references.
- `debs_plan_prices`: explicit rows for XOF, EUR, and USD, monthly or annual. No dynamic currency conversion.
- `debs_ai_rate_cards`: versioned provider/model usage rates.
- `debs_ai_usage_records`: stores the exact rate-card version and can link to the persisted rate-card row.

The schema exists, but there are no seeded prices, rate cards, active subscriptions, invoices, or payment orders. Provider integration and subscription synchronization are not implemented.

### Development test results

Database tests ran against the isolated development project:
- subscription and compensation grants;
- duplicate grant retries;
- subscription-first reservation allocation;
- settlement of actual usage and release of unused credits;
- release of a pending reservation without changing balances;
- idempotent settlement and release;
- rejection of insufficient balances and changed idempotency parameters;
- rejection of ledger and credit-lot provenance mutation;
- rejection of service-only grant RPC invocation by the authenticated role;
- reconciliation of ledger deltas to final wallet balances;
- a multi-request row-lock test: two concurrent requests each tried to reserve 80 credits from a 100-credit wallet; one succeeded and the other was rejected for insufficient credits;
- verification that standalone purchase RPC and credit-pack tables are absent after the disabling migration.

All temporary test records were removed. Follow-up counts confirmed zero wallet, lot, ledger, reservation, allocation, usage, subscription, invoice, or test-user records remain.

Supabase security advisor reports no wallet-specific security findings. Remaining search-path warnings concern two pre-existing baseline functions. Remaining performance findings concern pre-existing tables/policies and unused indexes on this fresh database.

This is a **transactional billing backend foundation**, not a production-ready payment system. It is not yet connected to the app's chat usage path or a payment provider. Authenticated-JWT owner-isolation tests, broader concurrency stress tests, webhook verification, and end-to-end payment tests remain incomplete. Checkout remains disabled.

## Application integration blocker

The current `/api/chat-stream` route validates the chat payload but does not verify the incoming bearer token. The chat UI also permits continuing without an account. Therefore, the wallet must not yet be connected to chat charging. Before integration, the app needs an explicit account/guest policy and a server-side authentication gate. Billing must use a dedicated development Supabase URL and service-role secret, never the production project configuration.

## Safety gates

1. Keep all development schema work in the isolated development project.
2. Never apply wallet changes directly to production as a development shortcut.
3. Reconcile repository and remote migration histories before further migration work.
4. Every balance-changing operation must be one PostgreSQL transaction and lock the wallet row with `SELECT ... FOR UPDATE`.
5. All write functions must be server-authorized and idempotent.
6. Browser clients must never write balances, lots, reservations, usage facts, payment events, invoices, or subscription state directly.
7. Complete concurrency, RLS/JWT isolation, idempotency, rollback, append-only ledger, and payment-event replay tests before production.
8. Production schema deployment and payment activation require explicit user approval after test evidence and a rollback plan.

## Remaining implementation phases

1. Establish the account/guest policy and enforce server-side authentication for credited chat.
2. Add authenticated-JWT owner-isolation tests and broader multi-session concurrency stress tests.
3. Connect the server-only RPCs to the app's AI usage path and the versioned usage meter.
4. Add subscription lifecycle synchronization, invoice generation, and monthly subscription-credit grants.
5. Add payment provider adapter, webhook signature verification, event reconciliation, and subscription-payment/refund workflows. Do not add standalone credit top-ups.
6. Verify merchant eligibility in Côte d'Ivoire, provider fees, legal/tax disclosures, and sandbox subscription payment flow.
7. Only after explicit approval, plan production migration and checkout activation with rollback steps.
