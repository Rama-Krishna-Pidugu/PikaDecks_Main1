-- Deferred cleanup for aborted uploads and account deletion retention.
-- Files/data are retained for a short bounded window, then purged by cleanup worker.

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists account_status text not null default 'active',
  add column if not exists deletion_requested_at timestamp without time zone,
  add column if not exists delete_after timestamp without time zone,
  add column if not exists deletion_reason text;

alter table public.uploads
  add column if not exists cleanup_status text not null default 'none',
  add column if not exists cleanup_reason text,
  add column if not exists cleanup_requested_at timestamp without time zone,
  add column if not exists delete_after timestamp without time zone;

create table if not exists public.file_cleanup_jobs (
  cleanup_job_id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(user_id) on delete set null,
  upload_id uuid references public.uploads(upload_id) on delete set null,
  file_url text not null,
  storage_provider text not null default 's3',
  storage_bucket text,
  storage_key text,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'deleted', 'failed', 'skipped')),
  requested_at timestamp without time zone not null default now(),
  delete_after timestamp without time zone not null,
  processed_at timestamp without time zone,
  error_message text,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  unique (upload_id, reason)
);

create index if not exists idx_users_deferred_delete
  on public.users (account_status, delete_after);
create index if not exists idx_uploads_cleanup_due
  on public.uploads (cleanup_status, delete_after);
create index if not exists idx_file_cleanup_jobs_due
  on public.file_cleanup_jobs (status, delete_after);
create index if not exists idx_file_cleanup_jobs_user
  on public.file_cleanup_jobs (user_id, status);
