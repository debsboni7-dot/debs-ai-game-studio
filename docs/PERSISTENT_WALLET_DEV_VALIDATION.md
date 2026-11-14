# Persistent wallet and billing development validation

Date: 2026-11-14

## Environment

- Supabase project: `debs-ai-billing-dev`
- Project ID: `qkxecdydyeknvgspvsff`
- Region: `eu-west-3` (Paris)
- Status: `ACTIVE_HEALTHY`
- Production project was not modified.

## Migration reconciliation

The new development database was initially empty. The six existing repository migrations were applied in order. Their remote version values were aligned to the repository's 14-digit filename prefixes so the development migration history matches the checked-in files.

Ten wallet/billing migrations were applied:
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

## Schema and privilege verification

Created and verified:
- Wallets, credit lots, immutable ledger, reservations, reservation-lot allocations.
- AI usage records and versioned AI rate-card schema.
- Subscription and invoice records.
- Explicit plan-price catalog for XOF, EUR, and USD, monthly and annual.

RLS and grants:
- RLS is enabled on all wallet/billing tables.
- Authenticated users have read-only access to owner-scoped wallet, subscription, and invoice records.
- Browser roles have no direct write privileges on financial records.
- Payment events, reservation allocations, and AI rate cards have explicit deny policies for anon/authenticated.
- Transactional RPC execution is available to `service_role`, not authenticated users.
- Ledger UPDATE/DELETE/TRUNCATE is blocked by privileges; an append-only trigger also rejects UPDATE/DELETE.
- Service role cannot DELETE/TRUNCATE wallets, lots, reservations, payment events, reservation allocations, usage records, subscriptions, invoices, or pricing/rate-card records.
- Wallet owner/identity and credit-lot provenance are guarded by triggers.
- Supporting indexes exist for billing foreign keys.

## No standalone credit purchases

The product decision is no standalone credit top-ups. The disabling migration:
- drops `grant_purchased_credits`;
- drops `debs_credit_pack_catalog` and `debs_credit_pack_orders`;
- renames the legacy pack-purchase and purchase-grant enum values to disabled values;
- documents the legacy `purchased_balance` column as a non-subscription compensation/store-credit balance only.

The `/credits` and `/abonnement` pages no longer offer or advertise separate credit packs. The pure TypeScript credit and reservation domains now call the second compartment `compensation`.

A post-migration test confirmed the compensation-credit path works, balances reconcile with the ledger, and the standalone purchase RPC and pack tables are absent. No plan-price rows or model-rate rows were seeded.

## Transactional test run

Tests passed for:
- subscription and compensation credit grants;
- idempotent grant retries;
- subscription-first reservation allocation;
- settlement of actual usage and release of unused credits;
- release of a pending reservation without changing balances;
- idempotent settlement and release;
- rejection of insufficient balances;
- rejection of idempotency-key reuse with changed parameters;
- rejection of ledger and credit-lot provenance mutation;
- rejection of service-only grant RPC invocation by the authenticated role;
- reconciliation of ledger deltas to final wallet balances.

A separate multi-request test held a wallet row lock while two independent requests attempted to reserve 80 credits each from a 100-credit balance. One succeeded and the competing request received the expected insufficient-credit error. Temporary user and wallet records were removed. A final count confirmed zero test users, wallets, lots, ledger entries, reservations, allocations, usage records, subscriptions, or invoices remain.

## Advisor results

No wallet-specific security findings remain. Two search-path warnings concern pre-existing baseline functions `touch_agent_work_session` and `debs_validate_memory_source_owner`. Remaining performance findings concern pre-existing tables/policies and unused indexes in this newly provisioned database.

## Important limitations

Authenticated-JWT row-isolation tests were not completed. The app's current `/api/chat-stream` route does not validate the bearer token, and guest chat is currently allowed. The wallet must not be connected to chat charging until an explicit account/guest policy and server-side authentication gate are implemented.

The concurrency test is a focused serialization check, not a full load/stress test. Webhook signature verification, payment reconciliation, and end-to-end app integration remain outstanding.

No production schema or payment configuration was changed. Checkout remains disabled.
