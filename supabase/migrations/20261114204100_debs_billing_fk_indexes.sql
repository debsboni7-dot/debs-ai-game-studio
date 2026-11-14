-- Supporting indexes for billing foreign keys.
create index debs_ai_usage_rate_card_idx
  on public.debs_ai_usage_records(rate_card_id)
  where rate_card_id is not null;

create index debs_invoices_subscription_idx
  on public.debs_invoices(subscription_id)
  where subscription_id is not null;
