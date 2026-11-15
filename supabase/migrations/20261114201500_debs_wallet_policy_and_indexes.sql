-- Make the payment-event deny rule explicit and index wallet foreign keys.
create policy "deny client access to payment events"
  on public.debs_payment_events
  for all to anon, authenticated
  using (false)
  with check (false);

create index debs_credit_ledger_lot_idx
  on public.debs_credit_ledger(lot_id)
  where lot_id is not null;

create index debs_credit_reservations_usage_record_idx
  on public.debs_credit_reservations(usage_record_id)
  where usage_record_id is not null;
