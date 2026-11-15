# DEBS AI Studio: credit reservations

## Product rules

Reservations draw from subscription credits first, then compensation/store credits. Standalone credit purchases are disabled.

## Pure TypeScript model

`src/lib/billing/reservations.ts` models reservation, settlement, and release arithmetic:
1. `reserveCredits` holds subscription credits first, then compensation/store credits.
2. `settleCreditReservation` consumes actual usage and returns unused credits to their original compartments.
3. `releaseCreditReservation` returns the entire hold when a mission is canceled or interrupted.

These functions are deterministic arithmetic helpers only. They do not provide persistence, concurrency control, idempotency across requests, or authorization.

## Persistent implementation

The database-backed implementation is in `supabase/migrations/20261114203000_debs_transactional_credit_operations.sql`. It locks the wallet row, records exact lot allocations, uses idempotency keys, and exposes write operations only to `service_role`.

The development validation report records the tests run against the isolated Supabase development project. Multi-session concurrency stress tests and authenticated-JWT owner-isolation tests remain outstanding.
