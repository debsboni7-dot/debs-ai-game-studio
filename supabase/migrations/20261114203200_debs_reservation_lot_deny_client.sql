-- Reservation allocation details are never exposed to browser roles.
create policy "deny client access to reservation lot allocations"
  on public.debs_credit_reservation_lots
  for all to anon, authenticated
  using (false)
  with check (false);
