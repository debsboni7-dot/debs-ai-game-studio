-- Gate repository changes behind an explicit user review of the generated diff.
alter table public.agent_work_sessions
  drop constraint if exists agent_work_sessions_status_check;

alter table public.agent_work_sessions
  add constraint agent_work_sessions_status_check
  check (status in (
    'queued', 'running', 'paused', 'awaiting_review',
    'completed', 'review_rejected', 'failed', 'cancelled', 'expired'
  ));

create index if not exists agent_work_sessions_review_idx
  on public.agent_work_sessions(user_id, updated_at desc)
  where status = 'awaiting_review';
