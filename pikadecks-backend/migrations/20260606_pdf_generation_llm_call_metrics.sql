alter table public.generation_jobs
  add column if not exists summary_calls integer not null default 0,
  add column if not exists card_calls integer not null default 0,
  add column if not exists total_llm_calls integer not null default 0,
  add column if not exists provider_call_breakdown jsonb not null default '{}'::jsonb;
