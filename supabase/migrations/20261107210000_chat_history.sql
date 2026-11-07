-- Durable, user-owned conversation history with Row Level Security.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nouvelle conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  created_at timestamptz not null default now()
);
create index if not exists conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index if not exists chat_messages_conversation_created_idx on public.chat_messages(conversation_id, created_at asc);
alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;
drop policy if exists "Users can read their conversations" on public.conversations;
create policy "Users can read their conversations" on public.conversations for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create their conversations" on public.conversations;
create policy "Users can create their conversations" on public.conversations for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their conversations" on public.conversations;
create policy "Users can update their conversations" on public.conversations for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their conversations" on public.conversations;
create policy "Users can delete their conversations" on public.conversations for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read their messages" on public.chat_messages;
create policy "Users can read their messages" on public.chat_messages for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create their messages" on public.chat_messages;
create policy "Users can create their messages" on public.chat_messages for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
);
drop policy if exists "Users can delete their messages" on public.chat_messages;
create policy "Users can delete their messages" on public.chat_messages for delete to authenticated using (auth.uid() = user_id);
