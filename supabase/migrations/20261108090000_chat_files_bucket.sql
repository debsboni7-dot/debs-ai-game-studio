-- Private bucket for files generated or downloaded directly in DEBS AI conversations.
-- File types and size are validated by the authenticated chat-files Edge Function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 15728640, null)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = null;
