# Billing UI implementation status

This branch adds mobile-first preview routes:
- `/abonnement`: five proposed plans and differentiating entitlements.
- `/credits`: independent top-up pack preview and owner-approved retention rules.
- `/facturation`: transparent disabled-payment state.

All prices are provisional XOF display values. EUR/USD prices are not published or converted automatically. No balances are fabricated, no checkout is initiated, and no payment or subscription is claimed active.

Backend wallet, immutable ledger, atomic reservations/settlement, RLS, verified payment webhooks and admin pricing remain unimplemented because project policy reserves database schema/migrations for Lovable-managed changes. Do not enable checkout until those controls and provider eligibility have been verified.
