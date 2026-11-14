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

## Schema verification

Created six wallet tables:
- `debs_wallets`
- `debs_credit_lots`
- `debs_credit_ledger`
- `debs_credit_reservations`
- `debs_ai_usage_records`
- `debs_payment_events`

Verified:
- RLS is enabled on all six tables.
- Authenticated role has SELECT only on wallet-owned tables, with owner-scoped SELECT policies.
- Authenticated and anon roles have no direct INSERT, UPDATE, DELETE, or TRUNCATE privileges on wallet tables.
- Payment events have an explicit deny policy for anon and authenticated roles, and no client table privileges.
- Service role can append ledger rows but cannot UPDATE, DELETE, or TRUNCATE the ledger.
- An append-only trigger rejects ledger UPDATE and DELETE.
- Service role cannot DELETE or TRUNCATE wallets, lots, reservations, or payment events.
- Usage records cannot be updated, deleted, or truncated by service role.
- Wallet foreign keys for ledger lots and reservation usage records have supporting indexes.

## Advisor results

The Supabase security advisor no longer reports the wallet payment-event RLS finding. Two remaining search-path warnings are on pre-existing baseline functions `touch_agent_work_session` and `debs_validate_memory_source_owner`. Performance findings remaining after wallet indexing concern pre-existing tables/policies and unused indexes in this newly provisioned database.

## Important limitation

This validates schema installation, migration metadata, RLS configuration, table privileges, and selected indexes. It does **not** yet validate concurrent wallet transactions, RPC authorization, actual owner-to-owner isolation with authenticated JWTs, webhook verification, or credit accounting. Those tests require the transactional RPC phase and a dedicated integration test harness.

No production schema or payment configuration was changed. Checkout remains disabled.
