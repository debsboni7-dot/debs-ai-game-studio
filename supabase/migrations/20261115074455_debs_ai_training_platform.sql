-- DEBS AI training, dataset governance, model registry and knowledge memory.
-- Applied to the isolated debs-ai-billing-dev project only during initial development.

create or replace function public.debs_is_ai_admin()
returns boolean language sql stable set search_path = pg_catalog
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'debs_role') = 'admin', false); $$;
revoke all on function public.debs_is_ai_admin() from public, anon;
grant execute on function public.debs_is_ai_admin() to authenticated;

create table public.debs_ai_datasets (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 2 and 120),
 description text not null default '',
 consent_basis text not null check (length(btrim(consent_basis)) between 8 and 1000),
 license_label text not null default 'Creator-provided; review required',
 status text not null default 'draft' check (status in ('draft','review','approved','archived')),
 item_count integer not null default 0 check (item_count >= 0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index debs_ai_datasets_created_idx on public.debs_ai_datasets(created_at desc);

create table public.debs_ai_dataset_items (
 id uuid primary key default gen_random_uuid(),
 dataset_id uuid not null references public.debs_ai_datasets(id) on delete cascade,
 input_text text not null check (length(btrim(input_text)) between 1 and 20000),
 target_text text not null check (length(btrim(target_text)) between 1 and 20000),
 split text not null check (split in ('train','validation','test')),
 source_reference text not null default '',
 pii_reviewed boolean not null default false,
 consent_confirmed boolean not null default false,
 content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(dataset_id, content_sha256)
);
create index debs_ai_dataset_items_dataset_split_idx on public.debs_ai_dataset_items(dataset_id, split);

create table public.debs_ai_training_jobs (
 id uuid primary key default gen_random_uuid(),
 dataset_id uuid not null references public.debs_ai_datasets(id),
 base_model text not null check (length(btrim(base_model)) between 2 and 160),
 training_method text not null default 'qlora' check (training_method in ('lora','qlora')),
 status text not null default 'queued' check (status in ('queued','preparing','training','evaluating','awaiting_approval','approved','rejected','failed','cancelled')),
 config jsonb not null default '{}'::jsonb,
 metrics jsonb not null default '{}'::jsonb,
 artifact_uri text,
 error_message text,
 worker_id text,
 attempts integer not null default 0 check (attempts >= 0),
 max_attempts integer not null default 2 check (max_attempts between 1 and 5),
 heartbeat_at timestamptz,
 started_at timestamptz,
 finished_at timestamptz,
 requested_by uuid not null references auth.users(id),
 approved_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index debs_ai_training_jobs_queue_idx on public.debs_ai_training_jobs(status, created_at);

create table public.debs_ai_model_releases (
 id uuid primary key default gen_random_uuid(),
 version text not null unique check (version ~ '^debs-[0-9]{4}\.[0-9]{2}\.[0-9]{2}([.-][a-zA-Z0-9]+)*$'),
 base_model text not null,
 training_job_id uuid not null references public.debs_ai_training_jobs(id),
 artifact_uri text not null,
 manifest jsonb not null,
 metrics jsonb not null default '{}'::jsonb,
 status text not null default 'awaiting_approval' check (status in ('awaiting_approval','active','rejected','archived')),
 created_by uuid not null references auth.users(id),
 approved_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 activated_at timestamptz
);
create unique index debs_ai_one_active_release_idx on public.debs_ai_model_releases(status) where status='active';

create table public.debs_ai_training_events (
 id bigint generated always as identity primary key,
 job_id uuid references public.debs_ai_training_jobs(id),
 release_id uuid references public.debs_ai_model_releases(id),
 event_type text not null,
 details jsonb not null default '{}'::jsonb,
 actor_id uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index debs_ai_training_events_job_idx on public.debs_ai_training_events(job_id, created_at desc);

create table public.debs_knowledge_documents (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(btrim(title)) between 2 and 180),
 content text not null check (length(btrim(content)) between 1 and 50000),
 source_reference text not null default '',
 license_label text not null default '',
 consent_basis text not null check (length(btrim(consent_basis)) between 8 and 1000),
 is_published boolean not null default false,
 search_vector tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,''))) stored,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index debs_knowledge_documents_search_idx on public.debs_knowledge_documents using gin(search_vector);
create index debs_knowledge_documents_published_idx on public.debs_knowledge_documents(is_published, created_at desc);

alter table public.debs_memories
 add column if not exists search_vector tsvector generated always as (to_tsvector('simple', coalesce(content,''))) stored,
 add column if not exists content_sha256 text;
create index if not exists debs_memories_search_idx on public.debs_memories using gin(search_vector);

alter table public.debs_ai_datasets enable row level security;
alter table public.debs_ai_dataset_items enable row level security;
alter table public.debs_ai_training_jobs enable row level security;
alter table public.debs_ai_model_releases enable row level security;
alter table public.debs_ai_training_events enable row level security;
alter table public.debs_knowledge_documents enable row level security;
grant select,insert,update,delete on public.debs_ai_datasets, public.debs_ai_dataset_items, public.debs_ai_training_jobs, public.debs_ai_model_releases, public.debs_knowledge_documents to authenticated;
grant select on public.debs_ai_training_events to authenticated;

create policy "DEBS admins manage AI datasets" on public.debs_ai_datasets for all to authenticated using ((select public.debs_is_ai_admin())) with check ((select public.debs_is_ai_admin()));
create policy "DEBS admins manage AI dataset items" on public.debs_ai_dataset_items for all to authenticated using ((select public.debs_is_ai_admin())) with check ((select public.debs_is_ai_admin()));
create policy "DEBS admins manage AI training jobs" on public.debs_ai_training_jobs for all to authenticated using ((select public.debs_is_ai_admin())) with check ((select public.debs_is_ai_admin()));
create policy "DEBS admins manage AI model releases" on public.debs_ai_model_releases for all to authenticated using ((select public.debs_is_ai_admin())) with check ((select public.debs_is_ai_admin()));
create policy "DEBS admins read AI training events" on public.debs_ai_training_events for select to authenticated using ((select public.debs_is_ai_admin()));
create policy "DEBS admins manage knowledge documents" on public.debs_knowledge_documents for all to authenticated using ((select public.debs_is_ai_admin())) with check ((select public.debs_is_ai_admin()));
create policy "Authenticated users read published DEBS knowledge" on public.debs_knowledge_documents for select to authenticated using (is_published=true);

create or replace function public.debs_claim_ai_training_job(p_worker_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare claimed public.debs_ai_training_jobs;
begin
 if current_setting('request.jwt.claim.role',true) <> 'service_role' then
  raise insufficient_privilege using message='service_role required';
 end if;
 if length(btrim(coalesce(p_worker_id,''))) < 3 or length(p_worker_id) > 120 then
  raise invalid_parameter_value using message='Invalid worker id';
 end if;
 select * into claimed from public.debs_ai_training_jobs
  where status='queued' and attempts < max_attempts order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.debs_ai_training_jobs set status='preparing',worker_id=p_worker_id,attempts=attempts+1,
  started_at=coalesce(started_at,now()),heartbeat_at=now(),updated_at=now(),error_message=null
  where id=claimed.id returning * into claimed;
 insert into public.debs_ai_training_events(job_id,event_type,details)
  values(claimed.id,'claimed',jsonb_build_object('worker_id',p_worker_id,'attempt',claimed.attempts));
 return to_jsonb(claimed);
end;
$$;
revoke all on function public.debs_claim_ai_training_job(text) from public,anon,authenticated;
grant execute on function public.debs_claim_ai_training_job(text) to service_role;

create or replace function public.debs_promote_model_release(p_release_id uuid)
returns public.debs_ai_model_releases language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare selected public.debs_ai_model_releases;
begin
 if not public.debs_is_ai_admin() then raise insufficient_privilege using message='DEBS admin role required'; end if;
 select * into selected from public.debs_ai_model_releases where id=p_release_id and status='awaiting_approval' for update;
 if not found then raise no_data_found using message='Candidate release not found'; end if;
 update public.debs_ai_model_releases set status='archived' where status='active';
 update public.debs_ai_model_releases set status='active',approved_by=(select auth.uid()),activated_at=now()
  where id=p_release_id returning * into selected;
 update public.debs_ai_training_jobs set status='approved',approved_by=(select auth.uid()),updated_at=now()
  where id=selected.training_job_id;
 insert into public.debs_ai_training_events(job_id,release_id,event_type,details,actor_id)
  values(selected.training_job_id,selected.id,'release_activated',jsonb_build_object('version',selected.version),(select auth.uid()));
 return selected;
end;
$$;
revoke all on function public.debs_promote_model_release(uuid) from public,anon;
grant execute on function public.debs_promote_model_release(uuid) to authenticated;
