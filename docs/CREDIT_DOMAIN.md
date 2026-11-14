# DEBS AI Studio credit domain

## Implemented as pure code

`src/lib/billing/credits.ts` defines deterministic rules for:

- Keeping subscription credits and separately purchased credits in distinct balances.
- Adding each new subscription grant to the entire unspent subscription balance (full rollover).
- Retaining accumulated credits when a user downgrades; no cap or reset is applied.
- Spending subscription credits first, then purchased credits.
- Rejecting invalid amounts, unsafe integers and insufficient balances without changing the input balances.

Purchased credits have no expiry field or automatic expiry operation.

## Important production boundary

This is a pure domain module, not a wallet, database, ledger, payment system or client-side balance store. It does not create or persist user balances. Production use must be wrapped by authenticated server-side operations and a database transaction that writes an immutable ledger, prevents concurrent double-spending, and verifies payment webhooks before crediting purchases.

Database schema and migrations remain Lovable-managed under `AGENTS.md`; this change intentionally does not edit `supabase/migrations/` or `drizzle/`. Do not expose these pure functions as trusted client-side spending endpoints.
