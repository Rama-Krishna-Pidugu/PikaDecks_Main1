-- Production AI orchestration pipeline for PDF flashcard generation.

create extension if not exists pgcrypto;

alter table public.uploads
  add column if not exists page_count integer,
  add column if not exists plan_at_upload text not null default 'free';

create table if not exists public.generation_jobs (
  job_id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(upload_id) on delete cascade,
  user_id uuid not null references public.users(user_id) on delete cascade,
  plan text not null default 'free',
  requested_cards integer not null default 10,
  page_count integer,
  status text not null default 'pending',
  stage text not null default 'UPLOADED',
  progress integer not null default 0,
  priority integer not null default 100,
  total_chunks integer not null default 0,
  completed_chunks integer not null default 0,
  failed_chunks integer not null default 0,
  total_prompt_tokens integer not null default 0,
  total_completion_tokens integer not null default 0,
  estimated_cost_usd numeric(10, 6) default 0,
  error_code text,
  error_message text,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  completed_at timestamp without time zone
);

create table if not exists public.generation_chunks (
  chunk_id uuid primary key default gen_random_uuid(),
  job_id uuid references public.generation_jobs(job_id) on delete cascade,
  upload_id uuid not null references public.uploads(upload_id) on delete cascade,
  chunk_index integer not null,
  page_start integer,
  page_end integer,
  heading text,
  text_hash text not null,
  text_s3_key text,
  chunk_text text,
  text_preview text,
  token_estimate integer,
  assigned_provider text,
  status text not null default 'pending',
  attempts integer not null default 0,
  fallback_count integer not null default 0,
  error_code text,
  error_message text,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  unique (upload_id, chunk_index)
);

create table if not exists public.chunk_summaries (
  summary_id uuid primary key default gen_random_uuid(),
  chunk_id uuid references public.generation_chunks(chunk_id) on delete cascade,
  job_id uuid references public.generation_jobs(job_id) on delete cascade,
  upload_id uuid references public.uploads(upload_id) on delete cascade,
  provider_name text not null,
  summary text not null,
  key_points jsonb not null default '[]'::jsonb,
  prompt_tokens integer default 0,
  completion_tokens integer default 0,
  latency_ms integer,
  created_at timestamp without time zone not null default now()
);

create table if not exists public.extracted_concepts (
  concept_id uuid primary key default gen_random_uuid(),
  job_id uuid references public.generation_jobs(job_id) on delete cascade,
  upload_id uuid references public.uploads(upload_id) on delete cascade,
  chunk_id uuid references public.generation_chunks(chunk_id) on delete set null,
  concept_type text not null,
  term text not null,
  definition text,
  relationships jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  importance_score numeric default 0,
  created_at timestamp without time zone not null default now()
);

create table if not exists public.generated_cards (
  generated_card_id uuid primary key default gen_random_uuid(),
  job_id uuid references public.generation_jobs(job_id) on delete cascade,
  upload_id uuid references public.uploads(upload_id) on delete cascade,
  chunk_id uuid references public.generation_chunks(chunk_id) on delete set null,
  concept_id uuid references public.extracted_concepts(concept_id) on delete set null,
  provider_name text,
  card_type text not null default 'qa',
  question text not null,
  answer text not null,
  explanation text,
  normalized_question text,
  quality_score numeric default 0,
  duplicate_group text,
  status text not null default 'staged',
  rejection_reason text,
  created_at timestamp without time zone not null default now()
);

create table if not exists public.processing_events (
  event_id uuid primary key default gen_random_uuid(),
  job_id uuid references public.generation_jobs(job_id) on delete cascade,
  upload_id uuid references public.uploads(upload_id) on delete cascade,
  chunk_id uuid references public.generation_chunks(chunk_id) on delete set null,
  provider_name text,
  stage text not null,
  level text not null default 'info',
  code text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp without time zone not null default now()
);

create table if not exists public.provider_health (
  provider_name text primary key,
  status text not null default 'CLOSED'
    check (status in ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_count integer not null default 0,
  success_count integer not null default 0,
  average_latency_ms integer,
  requests_last_minute integer not null default 0,
  tokens_last_minute integer not null default 0,
  tokens_today integer not null default 0,
  daily_token_limit integer,
  concurrent_requests integer not null default 0,
  max_concurrent_requests integer not null default 1,
  last_success timestamp without time zone,
  last_failure timestamp without time zone,
  cooldown_until timestamp without time zone,
  updated_at timestamp without time zone not null default now()
);

insert into public.provider_health (provider_name, max_concurrent_requests)
values ('openrouter', 1), ('gemini', 1), ('groq', 1)
on conflict (provider_name) do nothing;

create index if not exists idx_generation_jobs_user_created
  on public.generation_jobs (user_id, created_at desc);
create index if not exists idx_generation_jobs_status_priority
  on public.generation_jobs (status, priority, created_at);
create index if not exists idx_generation_chunks_upload_status
  on public.generation_chunks (upload_id, status);
create index if not exists idx_generation_chunks_provider_status
  on public.generation_chunks (assigned_provider, status);
create index if not exists idx_generated_cards_upload_status
  on public.generated_cards (upload_id, status);
create index if not exists idx_processing_events_upload_created
  on public.processing_events (upload_id, created_at desc);
