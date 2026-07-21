-- PikaDecks notification system.
-- Run after the spaced repetition migration.

create extension if not exists pgcrypto;

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  device_id text,
  push_token text not null,
  platform text not null check (platform in ('android', 'ios', 'web', 'unknown')),
  app_version text,
  is_active boolean not null default true,
  last_seen_at timestamp without time zone not null default now(),
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  unique (user_id, push_token)
);

create table if not exists public.notification_settings (
  user_id uuid primary key references public.users(user_id) on delete cascade,
  daily_review_reminders boolean not null default true,
  streak_notifications boolean not null default true,
  achievement_notifications boolean not null default true,
  overdue_notifications boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time without time zone default '22:00',
  quiet_hours_end time without time zone default '07:00',
  timezone text default 'UTC',
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now()
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  notification_type text not null check (
    notification_type in (
      'daily_review',
      'overdue_review',
      'streak',
      'achievement'
    )
  ),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'sent' check (status in ('sent', 'failed', 'opened')),
  provider_message_id text,
  error_message text,
  idempotency_key text not null,
  sent_at timestamp without time zone not null default now(),
  opened_at timestamp without time zone,
  created_at timestamp without time zone not null default now(),
  unique (idempotency_key)
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  achievement_key text not null,
  achieved_at timestamp without time zone not null default now(),
  notification_sent_at timestamp without time zone,
  created_at timestamp without time zone not null default now(),
  unique (user_id, achievement_key)
);

create table if not exists public.streak_tracking (
  user_id uuid primary key references public.users(user_id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_study_date date,
  last_notified_milestone integer,
  updated_at timestamp without time zone not null default now()
);

create index if not exists idx_user_push_tokens_user_active
  on public.user_push_tokens (user_id, is_active);

create index if not exists idx_user_push_tokens_device_active
  on public.user_push_tokens (device_id, is_active);

create index if not exists idx_user_push_tokens_token
  on public.user_push_tokens (push_token);

create index if not exists idx_notification_logs_user_type_sent
  on public.notification_logs (user_id, notification_type, sent_at desc);

create index if not exists idx_notification_logs_type_sent
  on public.notification_logs (notification_type, sent_at desc);

create index if not exists idx_user_achievements_user_key
  on public.user_achievements (user_id, achievement_key);

create index if not exists idx_streak_tracking_milestone
  on public.streak_tracking (last_notified_milestone, current_streak);

alter table public.user_push_tokens enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_logs enable row level security;
alter table public.user_achievements enable row level security;
alter table public.streak_tracking enable row level security;

drop policy if exists "Users can read own push tokens" on public.user_push_tokens;
create policy "Users can read own push tokens"
  on public.user_push_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "Users can manage own push tokens" on public.user_push_tokens;
create policy "Users can manage own push tokens"
  on public.user_push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read notification settings" on public.notification_settings;
create policy "Users can read notification settings"
  on public.notification_settings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update notification settings" on public.notification_settings;
create policy "Users can update notification settings"
  on public.notification_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read notification logs" on public.notification_logs;
create policy "Users can read notification logs"
  on public.notification_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read achievements" on public.user_achievements;
create policy "Users can read achievements"
  on public.user_achievements for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read streak tracking" on public.streak_tracking;
create policy "Users can read streak tracking"
  on public.streak_tracking for select
  using (auth.uid() = user_id);

insert into public.notification_settings (user_id)
select u.user_id
from public.users u
where not exists (
  select 1
  from public.notification_settings s
  where s.user_id = u.user_id
);
