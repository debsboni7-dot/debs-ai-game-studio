grant insert on public.debs_ai_training_events to authenticated;
create policy "DEBS admins append AI training events"
  on public.debs_ai_training_events for insert to authenticated
  with check ((select public.debs_is_ai_admin()));
