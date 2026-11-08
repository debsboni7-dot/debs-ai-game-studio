# DEBS Core — Memory foundation (phase 0)

This directory documents the first persistent-memory storage contract.

## Current behavior

- Memory is **off by default** for every account.
- A user must explicitly enable memory by creating/updating their own row in `debs_memory_preferences`.
- Memories are private to their owner and protected by Supabase Row Level Security.
- Disabling memory blocks reads, inserts and updates through user-scoped access. Existing memories remain deletable by their owner.
- Memory records are categorized as project, preference, fact or workflow.
- A record may be linked only to a conversation owned by the same user; deleting that conversation clears the source link, not the memory.
- Expiration is optional and represented by `expires_at`.

## Deliberate limitations

This is a database foundation only. It does not yet:
- extract or summarize facts from chats;
- inject memories into model prompts;
- provide a memory-management screen;
- run scheduled expiry cleanup;
- use private conversations as training data;
- train or fine-tune a DEBS model.

Do not enable automatic extraction until the UI has clear consent, review/edit/delete controls, and tests proving strict per-user isolation. Do not send private memory to third-party model providers unless the user has been clearly informed and has consented.

## User-scoped usage

Use the authenticated Supabase client from the request context so RLS is enforced. Never query this table with the service-role client for ordinary user memory operations. The server must derive `user_id` from verified auth claims, never from a caller-supplied body field.

## Schema

Migration: `supabase/migrations/20261108093000_debs_core_memory.sql`.
