alter table public.debs_ai_model_releases drop constraint if exists debs_ai_model_releases_status_check;
alter table public.debs_ai_model_releases add constraint debs_ai_model_releases_status_check
  check (status in ('awaiting_approval','approved','active','rejected','archived'));
create or replace function public.debs_promote_model_release(p_release_id uuid)
returns public.debs_ai_model_releases language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare selected public.debs_ai_model_releases;
begin
  if not public.debs_is_ai_admin() then raise insufficient_privilege using message='DEBS admin role required'; end if;
  select * into selected from public.debs_ai_model_releases where id=p_release_id and status='awaiting_approval' for update;
  if not found then raise no_data_found using message='Candidate release not found'; end if;
  update public.debs_ai_model_releases set status='approved',approved_by=(select auth.uid())
    where id=p_release_id returning * into selected;
  update public.debs_ai_training_jobs set status='approved',approved_by=(select auth.uid()),updated_at=now()
    where id=selected.training_job_id;
  insert into public.debs_ai_training_events(job_id,release_id,event_type,details,actor_id)
    values(selected.training_job_id,selected.id,'release_approved',
      jsonb_build_object('version',selected.version,'deployment','not_started'),(select auth.uid()));
  return selected;
end;
$$;
revoke all on function public.debs_promote_model_release(uuid) from public,anon;
grant execute on function public.debs_promote_model_release(uuid) to authenticated;
