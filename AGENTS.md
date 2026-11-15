# Repository instructions

## Git and deployment
- GitHub is the source of truth for development. Do not rely on Lovable editor workflows or Lovable MCP actions.
- Never rewrite published Git history. Do not force-push, amend, rebase, or squash commits that are already pushed.
- Keep changes on feature branches and use pull requests. Do not merge a change merely because it was authored; verify the relevant CI checks first.
- Do not claim a feature is deployed or operational unless the live environment has been checked.

## Database and migrations
- Supabase is the intended backend for persistent account data.
- Never apply schema changes directly to production as a development shortcut.
- Before adding or changing executable files in `supabase/migrations/` or `drizzle/`, inspect the repository migration history and the remote project's applied migration history. Reconcile any divergence first.
- Develop and test migrations against an isolated Supabase development database. A separate development project is acceptable; Supabase Branching may be used when the account plan supports it.
- If no isolated database is available, keep SQL as a clearly labelled, non-executable design artifact under `docs/`. Do not send it to production.
- Database writes that affect credits, payments, subscriptions, or entitlements must be transactional, idempotent, server-authorized, and covered by concurrency and RLS tests.
- Never allow browser clients to directly set wallet balances or append authoritative payment/credit ledger entries.
- Production schema deployment and payment activation require explicit user approval after tests and a rollback plan.

## Generated files and secrets
- Do not edit files whose headers identify them as automatically generated unless the generator workflow is understood and intentionally used.
- Never commit API keys, service-role keys, payment secrets, access tokens, or other credentials.
- Keep all privileged credentials server-side. Browser code must never receive service-role or provider secret keys.

## AI architecture
- Model calls go only through `src/lib/ai/chat.functions.ts` and server-only adapters in `registry.server.ts`; never expose keys or fake AI output (label examples).
- Do not make provider calls directly from browser code.
- Do not silently fall back to another model after a provider request fails; surface a clear error. A fallback may be used only when the preferred provider is not configured, and that behavior must be explicit.
- Preserve the existing final-only UI and plain-text history contract unless a change is deliberately designed and tested.

## Integrations and product behavior
- Integrations/tools live in `src/lib/integrations`, separate from the model layer.
- Write/execute actions require explicit user confirmation.
- See `docs/MVP.md` for what is real versus pending.
- MVP persistence may use browser localStorage only for non-authoritative preferences or prototypes. Account, billing, payment, and credit state must use secure server-side persistence.
