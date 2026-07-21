create extension if not exists pgcrypto;

create table if not exists public.youtube_generations (
  generation_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  youtube_url text not null,
  video_id text,
  title text,
  languages jsonb not null default '["en"]'::jsonb,
  transcript_length integer not null default 0,
  transcript_hash text,
  requested_cards integer not null default 10,
  provider_used text,
  provider_call_count integer not null default 0,
  summary_call_count integer not null default 0,
  card_call_count integer not null default 0,
  generation_status text not null default 'queued'
    check (generation_status in ('queued', 'processing', 'completed', 'failed')),
  processing_stage text not null default 'QUEUED',
  processing_progress integer not null default 0,
  error_code text,
  error_message text,
  deck_id uuid references public.decks(deck_id) on delete set null,
  cards_generated integer not null default 0,
  generation_duration_ms integer,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  completed_at timestamp without time zone
);

create index if not exists idx_youtube_generations_user_created
  on public.youtube_generations (user_id, created_at desc);

create index if not exists idx_youtube_generations_user_status
  on public.youtube_generations (user_id, generation_status, created_at desc);

create index if not exists idx_youtube_generations_user_transcript_hash
  on public.youtube_generations (user_id, transcript_hash);

create unique index if not exists idx_user_generation_cache_user_content_settings
  on public.user_generation_cache (user_id, content_hash, generation_settings_hash);

