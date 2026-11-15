# Billing UI implementation status

## Routes

- `/abonnement`: five proposed subscription plans, monthly/annual display, provisional XOF prices, payment-disabled state.
- `/credits`: explains subscription rollover and compensation/store-credit balance. No standalone packs or credit-purchase offers.
- `/facturation`: transparent disabled-payment state; no fabricated payment method, invoice, or active subscription.

## Product constraints reflected in the UI

- No free trial.
- Subscription credits roll over in full.
- Downgrades preserve all accumulated credits.
- A separate compensation/store-credit balance may exist, but standalone credit top-ups are not offered.
- Compensation/store credits do not expire, subject to applicable law.
- Subscription and compensation credits are spent separately, subscription first.

## Backend status

The isolated development Supabase project has a persistent wallet schema, transactional credit RPCs, subscription/invoice records, RLS, and least-privilege policies. The UI is not yet connected to the wallet or subscription backend. No price rows, AI rate-card rows, active subscriptions, invoices, or payment orders have been seeded. No payment provider is connected and checkout remains disabled.

## Release blockers

- The current `/api/chat-stream` route does not verify bearer authentication and guest chat remains available.
- Define the account/guest policy and add server-side authentication before connecting wallet charging.
- Connect the server-side usage meter and transactional wallet RPCs.
- Complete authenticated-JWT RLS tests, broader concurrency tests, webhook verification, payment reconciliation, and legal/provider checks.

Do not present preview prices as final or claim any payment feature is operational.
