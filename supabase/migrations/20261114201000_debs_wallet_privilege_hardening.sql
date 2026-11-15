-- Tighten service-role privileges on financial records.
-- The service role may perform controlled state transitions but must not erase records.

revoke delete, truncate on table
  public.debs_wallets,
  public.debs_credit_lots,
  public.debs_credit_reservations,
  public.debs_payment_events
from service_role;

-- Provider usage records are immutable audit facts after insertion.
revoke update, delete, truncate on table public.debs_ai_usage_records from service_role;

-- Ledger rows remain append-only: insertion and reading only.
revoke update, delete, truncate on table public.debs_credit_ledger from service_role;
