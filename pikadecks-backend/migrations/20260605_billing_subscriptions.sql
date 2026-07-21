-- Google Play Billing subscriptions.

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists plan_type text not null default 'free';

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  product_id text not null,
  purchase_token text not null,
  purchase_token_sha256 text not null,
  transaction_id text,
  platform text not null default 'android',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'cancelled', 'expired', 'in_grace_period', 'on_hold', 'unknown')),
  expires_at timestamp without time zone,
  purchase_time timestamp without time zone,
  verified_at timestamp without time zone,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  unique (purchase_token_sha256)
);

create index if not exists idx_user_subscriptions_user_status
  on public.user_subscriptions (user_id, status, expires_at desc);

create index if not exists idx_user_subscriptions_user_product
  on public.user_subscriptions (user_id, product_id, updated_at desc);

