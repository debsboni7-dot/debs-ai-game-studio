# DEBS AI Studio: secure wallet implementation

> This document supersedes the earlier design draft. The executable schema and transactional functions now live in `supabase/migrations/`. The implementation plan and validation report are the current source of truth.

## Binding product constraints

- Subscription credits and compensation/store credits are separate.
- Subscription credits roll over in full; downgrades do not remove accumulated credits.
- Compensation/store credits do not expire, subject to law.
- Standalone credit purchases and top-up packs are not offered.
- Spend subscription credits first, then compensation/store credits.
- No checkout or payment provider is activated yet.

## Security invariants

- Browser clients never write wallet balances, lots, reservations, ledger entries, usage records, subscriptions, invoices, or payment events.
- Financial writes use server-only, idempotent PostgreSQL functions.
- Balance-changing operations lock the wallet row and update balances, lots, reservations, and ledger atomically.
- The credit ledger is append-only.
- Wallet ownership and credit-lot provenance are immutable.
- RLS restricts reads to the owning user; payment events, reservation allocations, and rate cards are server-only.
- Provider webhooks must be signature-verified and deduplicated before any subscription or credit grant.
- No card number, CVV, PIN, or banking credentials are collected by DEBS AI Studio.

## Remaining release gates

1. Enforce authenticated server-side access on the chat stream and settle the account/guest policy.
2. Complete authenticated-JWT RLS tests and broader concurrent-session stress tests.
3. Connect AI usage metering to transactional reservations and settlement.
4. Implement subscription synchronization, invoices, provider webhooks, and payment reconciliation.
5. Verify merchant eligibility, fees, tax/legal disclosures, and sandbox payments.
6. Obtain explicit approval before any production migration or checkout activation.

See `docs/PERSISTENT_WALLET_IMPLEMENTATION_PLAN.md` and `docs/PERSISTENT_WALLET_DEV_VALIDATION.md` for the current implementation details and test evidence.
