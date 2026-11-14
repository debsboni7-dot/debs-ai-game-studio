-- Reservation lot allocations are server-only accounting records.
alter table public.debs_credit_reservation_lots enable row level security;
revoke all on table public.debs_credit_reservation_lots from public, anon, authenticated;
grant select, insert, update on table public.debs_credit_reservation_lots to service_role;
revoke delete, truncate on table public.debs_credit_reservation_lots from service_role;
