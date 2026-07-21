-- User-scoped generation cache, token accounting, and rate-limit buckets.
-- Privacy rule: cache hits are allowed only inside the same user_id boundary.

create extension if not exists pgcrypto;

alter table public.uploads
  add column if not exists content_hash text,
  add column if not exists extracted_text_hash text,
  add column if not exists token_estimate integer,
  add column if not exists cache_hit boolean not null default false,
  add column if not exists cache_generation_id uuid;

alter table public.generation_jobs
  add column if not exists content_hash text,
  add column if not exists generation_settings_hash text,
  add column if not exists cache_generation_id uuid,
  add column if not exists queue_entered_at timestamp without time zone,
  add column if not exists worker_started_at timestamp without time zone,
  add column if not exists provider_strategy text not null default 'openrouter_primary_gemini_secondary',
  add column if not exists token_size_class text;

create table if not exists public.user_generation_cache (
  generation_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  content_hash text not null,
  generation_settings_hash text not null,
  source_token_estimate integer,
  requested_cards integer not null default 10,
  generated_cards jsonb not null default '[]'::jsonb,
  deck_title text,
  card_count integer not null default 0,
  provider_summary jsonb not null default '{}'::jsonb,
  total_prompt_tokens integer not null default 0,
  total_completion_tokens integer not null default 0,
  estimated_cost_usd numeric(10, 6) default 0,
  created_from_upload_id uuid references public.uploads(upload_id) on delete set null,
  created_from_job_id uuid references public.generation_jobs(job_id) on delete set null,
  last_used_at timestamp without time zone,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  unique (user_id, content_hash, generation_settings_hash)
);

create table if not exists public.text_extraction_cache (
  extraction_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  file_hash text not null,
  content_hash text not null,
  page_count integer,
  token_estimate integer,
  extracted_text_preview text,
  extracted_text_s3_key text,
  created_from_upload_id uuid references public.uploads(upload_id) on delete set null,
  last_used_at timestamp without time zone,
  created_at timestamp without time zone not null default now(),
  unique (user_id, file_hash)
);

create table if not exists public.provider_usage_events (
  usage_event_id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(user_id) on delete set null,
  upload_id uuid references public.uploads(upload_id) on delete set null,
  job_id uuid references public.generation_jobs(job_id) on delete set null,
  chunk_id uuid references public.generation_chunks(chunk_id) on delete set null,
  provider_name text not null,
  model_name text,
  request_type text not null default 'chunk_generation',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  estimated_cost_usd numeric(10, 6) default 0,
  latency_ms integer,
  status text not null default 'success',
  error_code text,
  retry_count integer not null default 0,
  fallback_used boolean not null default false,
  created_at timestamp without time zone not null default now()
);

create table if not exists public.rate_limit_buckets (
  bucket_id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('user', 'global', 'provider')),
  scope_key text not null,
  provider_name text,
  window_start timestamp without time zone not null,
  window_seconds integer not null,
  request_count integer not null default 0,
  token_count integer not null default 0,
  limit_requests integer,
  limit_tokens integer,
  updated_at timestamp without time zone not null default now(),
  unique (scope, scope_key, provider_name, window_start, window_seconds)
);

create index if not exists idx_uploads_user_content_hash
  on public.uploads (user_id, content_hash);
create index if not exists idx_generation_jobs_content_hash
  on public.generation_jobs (user_id, content_hash, generation_settings_hash);
create index if not exists idx_user_generation_cache_lookup
  on public.user_generation_cache (user_id, content_hash, generation_settings_hash);
create index if not exists idx_text_extraction_cache_lookup
  on public.text_extraction_cache (user_id, file_hash);
create index if not exists idx_provider_usage_job_created
  on public.provider_usage_events (job_id, created_at desc);
create index if not exists idx_provider_usage_provider_created
  on public.provider_usage_events (provider_name, created_at desc);
create index if not exists idx_rate_limit_buckets_scope
  on public.rate_limit_buckets (scope, scope_key, provider_name, window_start desc);
