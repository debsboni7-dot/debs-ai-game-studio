# DEBS AI Studio subscription lifecycle rules

Status: pure TypeScript decision helpers and unit tests. This is not a payment integration or persistent subscription service.

## Implemented

`src/lib/billing/lifecycle.ts` evaluates whether subscription-only entitlements remain available based on server-supplied subscription state and the current timestamp:

- Active: access remains available until the paid period ends.
- Cancellation scheduled at period end: current paid access remains, but the next automatic renewal is stopped.
- Canceled: access remains only until the already-paid period ends.
- Past due: access may continue only until an explicitly configured grace-period end. No grace duration is hard-coded.
- Expired: subscription entitlements are unavailable.
- Purchased credits are not part of this decision and must remain separately accessible under their own rules.

The helper also exposes a pure decision for whether automatic renewal should be stopped.

## Security and production boundary

- The timestamp and subscription state must come from trusted server-side records, not client input.
- Only verified provider events and authorized server actions may change subscription state.
- The helper does not charge a customer, cancel a provider subscription, grant credits, refund money, or write a database.
- It must not be used as an authorization boundary in browser code.
- Refund eligibility is intentionally not encoded as a universal rule. It depends on published terms, the transaction history, provider capabilities and mandatory consumer law in each served jurisdiction.
- Database schema and migrations remain Lovable-managed under `AGENTS.md`.

## Required production tests

Add integration tests against the real server/database workflow for webhook retries, delayed/duplicate events, cancellation races, renewal after scheduled cancellation, failed payment and grace-period expiry, and preservation of purchased credits after subscription expiry.
