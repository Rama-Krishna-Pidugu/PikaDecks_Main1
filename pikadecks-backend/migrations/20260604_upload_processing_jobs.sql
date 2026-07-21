-- Upload processing job metadata for asynchronous flashcard generation.

alter table public.uploads
  add column if not exists processing_stage text default 'UPLOADED',
  add column if not exists processing_progress integer not null default 0,
  add column if not exists processing_error_code text,
  add column if not exists processing_error_message text,
  add column if not exists deck_id uuid references public.decks(deck_id) on delete set null,
  add column if not exists completed_at timestamp without time zone,
  add column if not exists updated_at timestamp without time zone not null default now();

create index if not exists idx_uploads_user_status_created
  on public.uploads (user_id, processing_status, created_at desc);

create index if not exists idx_uploads_user_created
  on public.uploads (user_id, created_at desc);
