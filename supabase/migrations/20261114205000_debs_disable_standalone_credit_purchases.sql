-- Standalone credit top-ups are explicitly disabled by product decision.
drop function if exists public.grant_purchased_credits(uuid, text, bigint, text);
drop table if exists public.debs_credit_pack_orders;
drop table if exists public.debs_credit_pack_catalog;

alter type public.debs_credit_lot_source
  rename value 'pack_purchase' to 'legacy_disabled_pack_purchase';

alter type public.debs_credit_ledger_entry_type
  rename value 'purchase_grant' to 'legacy_disabled_purchase_grant';

comment on column public.debs_wallets.purchased_balance is
  'Legacy technical name for the non-subscription compensation/store-credit balance. Standalone credit purchases are not offered.';

comment on column public.debs_credit_lots.source is
  'Credit-lot origin. Standalone pack-purchase origin is disabled; compensation credits may be granted by server policy.';
