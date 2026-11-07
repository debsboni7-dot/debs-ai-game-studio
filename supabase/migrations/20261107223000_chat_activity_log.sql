alter table public.chat_messages
  add column if not exists activity jsonb not null default '[]'::jsonb;

create index if not exists chat_messages_activity_gin_idx
  on public.chat_messages using gin (activity);
