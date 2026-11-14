# Persistent wallet development validation

Date: 2026-11-14

## Environment

- Supabase project: `debs-ai-billing-dev`
- Project ID: `qkxecdydyeknvgspvsff`
- Region: `eu-west-3` (Paris)
- Status: `ACTIVE_HEALTHY`
- Production project was not modified.

## Migration reconciliation

The new development database was initially empty. The six existing repository migrations were applied in order. Their remote version values were then aligned to the repository's 14-digit filename prefixes so that the development migration history matches the checked-in files.

Wallet migrations applied:
- `20261114195900_debs_persistent_credit_wallet.sql`
- `20261114201000_debs_wallet_privilege_hardening.sql`

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
- Payment events have no authenticated access.
- Service role can append ledger rows but cannot UPDATE, DELETE, or TRUNCATE the ledger.
- An append-only trigger rejects ledger UPDATE and DELETE.
- Service role cannot DELETE or TRUNCATE wallets, lots, reservations, payment events, or usage records.
- Usage records cannot be updated or deleted by service role.

## Important limitation

This validates schema installation, metadata, RLS configuration, and table privileges. It does **not** yet validate concurrent wallet transactions, RPC authorization, actual owner-to-owner isolation with authenticated JWTs, webhook verification, or credit accounting. Those tests require the transactional RPC phase and a dedicated integration test harness.

No production schema or payment configuration was changed. Checkout remains disabled.
