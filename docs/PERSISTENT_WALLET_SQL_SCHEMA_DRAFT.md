# Persistent wallet SQL schema draft

> **SUPERSEDED.** This was the initial non-executable design draft. It is retained only as historical context. Do not copy or apply its SQL.

The executable schema is now maintained in `supabase/migrations/`, including:
- persistent wallet, credit lots, immutable ledger, and reservation allocations;
- server-only transactional credit RPCs;
- RLS and least-privilege policies;
- subscription, invoice, plan-price, and AI rate-card records;
- explicit disabling of standalone credit purchases.

The current product rule is that the second credit compartment is reserved for compensation/store credits only. Standalone top-ups and credit-pack purchases are not offered.

Use these documents as the current source of truth:
- `docs/PERSISTENT_WALLET_IMPLEMENTATION_PLAN.md`
- `docs/PERSISTENT_WALLET_DEV_VALIDATION.md`
- `docs/SECURE_CREDIT_LEDGER_SPEC.md`

All migrations have been applied and tested only in the isolated `debs-ai-billing-dev` Supabase project. Production remains unchanged. Checkout remains disabled.
