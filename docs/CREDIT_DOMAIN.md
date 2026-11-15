# DEBS AI Studio credit domain

## Product rules

- Subscription credits and compensation/store credits are tracked separately.
- Every unused subscription credit rolls over in full.
- A downgrade never removes or caps credits already accumulated.
- Compensation/store credits do not expire, subject to applicable law.
- Standalone credit purchases and top-up packs are not offered.
- Spending consumes subscription credits first, then compensation/store credits.

## Pure TypeScript domain rules

`src/lib/billing/credits.ts` implements deterministic arithmetic for adding subscription grants and spending across the two compartments. It is a pure module: it does not persist balances and must not be used as a client-side source of truth.

`src/lib/billing/reservations.ts` models reservation, settlement, and release arithmetic. It is also a pure module and is not a concurrency or authorization boundary.

## Persistent backend

The executable database schema and service-only transactional functions are in `supabase/migrations/`. The authoritative implementation status and test evidence are recorded in `docs/PERSISTENT_WALLET_IMPLEMENTATION_PLAN.md` and `docs/PERSISTENT_WALLET_DEV_VALIDATION.md`.

The legacy database field `purchased_balance` is reserved exclusively for compensation/store credits. Do not label it as a balance available for purchase. All real spending must go through authenticated server-side transactions and the append-only ledger.
