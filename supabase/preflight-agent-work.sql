-- Read-only preflight for the persistent agent-work backend.
-- Run in the Supabase SQL Editor before enabling the worker.
-- A result of false means the corresponding migration/extension/scheduler step is still pending.

with checks as (
  select 'agent_work_sessions table' as check_name,
         to_regclass('public.agent_work_sessions') is not null as ok,
         coalesce(to_regclass('public.agent_work_sessions')::text, 'missing') as detail
  union all
  select 'agent_work_tasks table',
         to_regclass('public.agent_work_tasks') is not null,
         coalesce(to_regclass('public.agent_work_tasks')::text, 'missing')
  union all
  select 'agent_work_events table',
         to_regclass('public.agent_work_events') is not null,
         coalesce(to_regclass('public.agent_work_events')::text, 'missing')
  union all
  select 'claim_agent_work_task(integer)',
         to_regprocedure('public.claim_agent_work_task(integer)') is not null,
         coalesce(to_regprocedure('public.claim_agent_work_task(integer)')::text, 'missing')
  union all
  select 'pgcrypto extension',
         exists(select 1 from pg_extension where extname = 'pgcrypto'),
         coalesce((select extversion from pg_extension where extname = 'pgcrypto'), 'missing')
  union all
  select 'pg_cron extension',
         exists(select 1 from pg_extension where extname = 'pg_cron'),
         coalesce((select extversion from pg_extension where extname = 'pg_cron'), 'missing')
  union all
  select 'pg_net extension',
         exists(select 1 from pg_extension where extname = 'pg_net'),
         coalesce((select extversion from pg_extension where extname = 'pg_net'), 'missing')
  union all
  select 'Vault schema',
         exists(select 1 from information_schema.schemata where schema_name = 'vault'),
         case when exists(select 1 from information_schema.schemata where schema_name = 'vault') then 'present' else 'missing' end
  union all
  select 'cron.job relation',
         to_regclass('cron.job') is not null,
         coalesce(to_regclass('cron.job')::text, 'missing')
)
select check_name, ok, detail
from checks
order by check_name;

-- RLS should be enabled on all three mission tables after the migration.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('agent_work_sessions', 'agent_work_tasks', 'agent_work_events')
order by c.relname;
