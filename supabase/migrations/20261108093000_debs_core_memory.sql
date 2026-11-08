-- DEBS Core memory foundation.
-- Memory is opt-in and user-owned. This migration creates storage only;
-- it does not extract memories, train models, or enable memory automatically.

create table if not exists public.debs_memory_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debs_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type text not null check (memory_type in ('project', 'preference', 'fact', 'workflow')),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  source_conversation_id uuid references public.conversations(id) on delete set null,
  importance smallint not null default 3 check (importance between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  constraint debs_memories_expiry_after_creation check (expires_at is null or expires_at > created_at)
);

create index if not exists debs_memories_user_recent_idx
  on public.debs_memories(user_id, updated_at desc);
create index if not exists debs_memories_user_type_idx
  on public.debs_memories(user_id, memory_type);

alter table public.debs_memory_preferences enable row level security;
alter table public.debs_memories enable row level security;

drop policy if exists "Users manage their DEBS memory preferences" on public.debs_memory_preferences;
create policy "Users manage their DEBS memory preferences"
  on public.debs_memory_preferences
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users read enabled DEBS memories" on public.debs_memories;
create policy "Users read enabled DEBS memories"
  on public.debs_memories
  for select to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.debs_memory_preferences p
      where p.user_id = auth.uid() and p.enabled = true
    )
  );

drop policy if exists "Users add enabled DEBS memories" on public.debs_memories;
create policy "Users add enabled DEBS memories"
  on public.debs_memories
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.debs_memory_preferences p
      where p.user_id = auth.uid() and p.enabled = true
    )
  );

drop policy if exists "Users update enabled DEBS memories" on public.debs_memories;
create policy "Users update enabled DEBS memories"
  on public.debs_memories
  for update to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.debs_memory_preferences p
      where p.user_id = auth.uid() and p.enabled = true
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.debs_memory_preferences p
      where p.user_id = auth.uid() and p.enabled = true
    )
  );

-- Owners can always delete their memories, including after disabling memory.
drop policy if exists "Users delete their DEBS memories" on public.debs_memories;
create policy "Users delete their DEBS memories"
  on public.debs_memories
  for delete to authenticated
  using (auth.uid() = user_id);
