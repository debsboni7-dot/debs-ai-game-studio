# Persistent wallet development validation

Date: 2026-11-14

## Environment

- Supabase project: `debs-ai-billing-dev`
- Project ID: `qkxecdydyeknvgspvsff`
- Region: `eu-west-3` (Paris)
- Status: `ACTIVE_HEALTHY`
- Production project was not modified.

## Migration reconciliation

The new development database was initially empty. The six existing repository migrations were applied in order. Their remote version values were aligned to the repository's 14-digit filename prefixes so the development migration history matches the checked-in files.

Wallet migrations applied:
- `20261114195900_debs_persistent_credit_wallet.sql`
- `20261114201000_debs_wallet_privilege_hardening.sql`
- `20261114201500_debs_wallet_policy_and_indexes.sql`
- `20261114202000_debs_wallet_provenance_guards.sql`
- `20261114203000_debs_transactional_credit_operations.sql`
- `20261114203100_debs_reservation_lot_security.sql`
- `20261114203200_debs_reservation_lot_deny_client.sql`

## Schema and privilege verification

Created:
- `debs_wallets`
- `debs_credit_lots`
- `debs_credit_ledger`
- `debs_credit_reservations`
- `debs_credit_reservation_lots`
- `debs_ai_usage_records`
- `debs_payment_events`

Verified:
- RLS is enabled on all wallet tables.
- Authenticated role has SELECT only on owner-scoped wallet views.
- Browser roles have no direct write privileges on financial tables.
- Payment events and reservation allocations have explicit deny policies for anon/authenticated and no client table privileges.
- RPC execution is available to `service_role`, not authenticated users.
- Ledger UPDATE/DELETE/TRUNCATE is blocked by privileges; an append-only trigger also rejects UPDATE/DELETE.
- Service role cannot DELETE/TRUNCATE wallets, lots, reservations, payment events, reservation allocations, or usage records.
- Usage records cannot be updated or deleted by service role.
- Wallet owner/identity and credit-lot provenance are guarded by triggers.
- Wallet foreign keys for ledger lots and reservation usage records have supporting indexes.

## Transactional test run

A test script ran within a transaction and ended with ROLLBACK. Assertions passed for:
- subscription and purchased credit grants;
- idempotent subscription grant retry;
- subscription-first reservation allocation;
- settlement of actual usage and release of unused credits;
- release of a pending reservation without changing balances;
- idempotent settlement and release;
- rejection of insufficient balances;
- rejection of idempotency-key reuse with changed parameters;
- rejection of ledger and credit-lot provenance mutation;
- rejection of service-only grant RPC invocation by the authenticated role.

A follow-up count query confirmed zero test rows remain in wallets, lots, ledger, reservations, reservation allocations, and usage records.

## Advisor results

No wallet-specific security findings remain. Two search-path warnings concern pre-existing baseline functions `touch_agent_work_session` and `debs_validate_memory_source_owner`. Remaining performance findings concern pre-existing tables/policies and unused indexes in this newly provisioned database.

## Important limitation

The test run used a single database session. It does **not** prove concurrent-session race safety or complete authenticated-JWT owner isolation. Those tests remain required, along with webhook signature verification, payment reconciliation, and end-to-end app integration.

No production schema or payment configuration was changed. Checkout remains disabled.
