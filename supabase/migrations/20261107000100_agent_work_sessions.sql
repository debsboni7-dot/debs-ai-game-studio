create extension if not exists pgcrypto;
create table if not exists public.agent_work_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, goal text not null,
 status text not null default 'queued' check(status in ('queued','running','paused','completed','failed','cancelled','expired')),
 requested_hours integer not null check(requested_hours between 1 and 168), deadline_at timestamptz not null,
 heartbeat_at timestamptz, next_run_at timestamptz not null default now(), checkpoint jsonb not null default '{}'::jsonb,
 last_summary text, step_count integer not null default 0, max_steps integer not null default 100 check(max_steps between 1 and 2000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.agent_work_tasks (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.agent_work_sessions(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
 task_type text not null default 'agent_step', input jsonb not null default '{}'::jsonb, result jsonb,
 attempt integer not null default 0, max_attempts integer not null default 4, available_at timestamptz not null default now(),
 lease_until timestamptz, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.agent_work_events (
 id bigint generated always as identity primary key, session_id uuid not null references public.agent_work_sessions(id) on delete cascade,
 task_id uuid references public.agent_work_tasks(id) on delete set null, event_type text not null, message text not null,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists agent_work_sessions_user_created_idx on public.agent_work_sessions(user_id,created_at desc);
create index if not exists agent_work_sessions_due_idx on public.agent_work_sessions(status,next_run_at);
create index if not exists agent_work_tasks_claim_idx on public.agent_work_tasks(status,available_at,created_at);
create index if not exists agent_work_tasks_session_idx on public.agent_work_tasks(session_id,created_at);
create index if not exists agent_work_events_session_idx on public.agent_work_events(session_id,created_at);
alter table public.agent_work_sessions enable row level security;
alter table public.agent_work_tasks enable row level security;
alter table public.agent_work_events enable row level security;
drop policy if exists "Users read own agent sessions" on public.agent_work_sessions;
create policy "Users read own agent sessions" on public.agent_work_sessions for select to authenticated using(auth.uid()=user_id);
-- Session creation and state changes are server-controlled; clients only read their own rows.
drop policy if exists "Users create own agent sessions" on public.agent_work_sessions;
-- Session state is changed only by the trusted Edge Function using the service role.
-- Authenticated users may read their sessions, but cannot directly rewrite status or checkpoints.
drop policy if exists "Users update own agent sessions" on public.agent_work_sessions;
drop policy if exists "Users read own agent tasks" on public.agent_work_tasks;
create policy "Users read own agent tasks" on public.agent_work_tasks for select to authenticated using(exists(select 1 from public.agent_work_sessions s where s.id=session_id and s.user_id=auth.uid()));
drop policy if exists "Users read own agent events" on public.agent_work_events;
create policy "Users read own agent events" on public.agent_work_events for select to authenticated using(exists(select 1 from public.agent_work_sessions s where s.id=session_id and s.user_id=auth.uid()));
create or replace function public.claim_agent_work_task(p_lease_seconds integer default 180)
returns setof public.agent_work_tasks language plpgsql security definer set search_path=public as $$
declare v_task public.agent_work_tasks;
declare v_session_id uuid;
begin
 -- Keep the same lock order as pause/cancel: session rows before task rows.
 update public.agent_work_sessions s set status='failed',last_summary='Une étape a expiré après plusieurs tentatives.',updated_at=now()
 where s.status in ('queued','running') and exists(
   select 1 from public.agent_work_tasks t
   where t.session_id=s.id and t.status='running' and t.lease_until<now() and t.attempt>=t.max_attempts
 );
 update public.agent_work_tasks t set status='queued',lease_until=null,available_at=now(),updated_at=now(),
 last_error=coalesce(t.last_error,'Worker lease expired; task returned to queue.')
 where t.status='running' and t.lease_until<now() and t.attempt<t.max_attempts;
 update public.agent_work_tasks t set status='failed',lease_until=null,updated_at=now(),
 last_error=coalesce(t.last_error,'Worker lease expired too many times.')
 where t.status='running' and t.lease_until<now() and t.attempt>=t.max_attempts;
 -- Lock the session first, matching the pause/cancel path's lock order.
 select s.id into v_session_id
 from public.agent_work_sessions s
 where s.status in ('queued','running') and s.deadline_at>now()
 and exists (
   select 1 from public.agent_work_tasks t
   where t.session_id=s.id and t.status='queued' and t.available_at<=now()
   and (s.step_count<s.max_steps or t.task_type in ('github_ci_check','github_ci_repair'))
 )
 order by s.next_run_at,s.created_at
 limit 1 for update of s skip locked;
 if not found then return; end if;

 select t.* into v_task from public.agent_work_tasks t
 where t.session_id=v_session_id and t.status='queued' and t.available_at<=now()
 order by t.available_at,t.created_at
 limit 1 for update skip locked;
 if not found then return; end if;

 update public.agent_work_tasks set status='running',attempt=attempt+1,
 lease_until=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,600))),updated_at=now()
 where id=v_task.id returning * into v_task;
 update public.agent_work_sessions set status='running',heartbeat_at=now(),updated_at=now() where id=v_session_id;
 return next v_task;
end; $$;
revoke all on function public.claim_agent_work_task(integer) from public,anon,authenticated;
grant execute on function public.claim_agent_work_task(integer) to service_role;

-- Explicit least-privilege table grants. RLS further limits authenticated reads
-- to rows belonging to auth.uid(); writes are reserved for service_role.
revoke all on table public.agent_work_sessions, public.agent_work_tasks, public.agent_work_events from anon, authenticated;
grant select on table public.agent_work_sessions, public.agent_work_tasks, public.agent_work_events to authenticated;
grant all privileges on table public.agent_work_sessions, public.agent_work_tasks, public.agent_work_events to service_role;
grant usage, select on sequence public.agent_work_events_id_seq to service_role;
create or replace function public.touch_agent_work_session() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists agent_work_sessions_touch on public.agent_work_sessions;
create trigger agent_work_sessions_touch before update on public.agent_work_sessions for each row execute function public.touch_agent_work_session();
