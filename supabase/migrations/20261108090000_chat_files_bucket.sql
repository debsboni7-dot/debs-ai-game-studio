-- Private bucket for files generated or downloaded directly in DEBS AI conversations.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  15728640,
  array[
    'application/octet-stream', 'application/pdf', 'application/json', 'text/plain', 'text/markdown',
    'text/html', 'text/css', 'text/javascript', 'application/javascript', 'application/xml',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif',
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'video/mp4', 'video/webm',
    'model/gltf-binary', 'model/gltf+json', 'font/ttf', 'font/otf', 'font/woff', 'font/woff2'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
