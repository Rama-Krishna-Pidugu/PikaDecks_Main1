-- Server-owned rolling 24-hour AI generation quota for free users.
-- Premium users bypass this table in the backend entitlement service.

create table if not exists public.user_ai_usage_quotas (
  user_id uuid primary key references public.users(user_id) on delete cascade,
  usage_count integer not null default 0 check (usage_count >= 0),
  quota_reset_at timestamp without time zone not null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now()
);

create index if not exists idx_user_ai_usage_quotas_reset
  on public.user_ai_usage_quotas (quota_reset_at);

create or replace function public.get_ai_generation_quota(
  p_user_id uuid,
  p_limit integer default 10,
  p_window_seconds integer default 86400
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp without time zone := timezone('utc', now());
  v_reset_at timestamp without time zone;
  v_usage_count integer;
begin
  if p_limit <= 0 then
    raise exception 'p_limit must be positive';
  end if;

  insert into public.user_ai_usage_quotas (user_id, usage_count, quota_reset_at)
  values (p_user_id, 0, v_now + make_interval(secs => p_window_seconds))
  on conflict (user_id) do nothing;

  select usage_count, quota_reset_at
    into v_usage_count, v_reset_at
  from public.user_ai_usage_quotas
  where user_id = p_user_id
  for update;

  if v_reset_at <= v_now then
    v_usage_count := 0;
    v_reset_at := v_now + make_interval(secs => p_window_seconds);

    update public.user_ai_usage_quotas
       set usage_count = v_usage_count,
           quota_reset_at = v_reset_at,
           updated_at = v_now
     where user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'allowed', v_usage_count < p_limit,
    'usage_count', v_usage_count,
    'limit', p_limit,
    'remaining', greatest(0, p_limit - v_usage_count),
    'quota_reset_at', to_char(v_reset_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end;
$$;

create or replace function public.check_and_increment_ai_generation_quota(
  p_user_id uuid,
  p_limit integer default 10,
  p_window_seconds integer default 86400
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp without time zone := timezone('utc', now());
  v_reset_at timestamp without time zone;
  v_usage_count integer;
  v_allowed boolean;
begin
  if p_limit <= 0 then
    raise exception 'p_limit must be positive';
  end if;

  insert into public.user_ai_usage_quotas (user_id, usage_count, quota_reset_at)
  values (p_user_id, 0, v_now + make_interval(secs => p_window_seconds))
  on conflict (user_id) do nothing;

  select usage_count, quota_reset_at
    into v_usage_count, v_reset_at
  from public.user_ai_usage_quotas
  where user_id = p_user_id
  for update;

  if v_reset_at <= v_now then
    v_usage_count := 0;
    v_reset_at := v_now + make_interval(secs => p_window_seconds);
  end if;

  v_allowed := v_usage_count < p_limit;

  if v_allowed then
    v_usage_count := v_usage_count + 1;
  end if;

  update public.user_ai_usage_quotas
     set usage_count = v_usage_count,
         quota_reset_at = v_reset_at,
         updated_at = v_now
   where user_id = p_user_id;

  return jsonb_build_object(
    'allowed', v_allowed,
    'usage_count', v_usage_count,
    'limit', p_limit,
    'remaining', greatest(0, p_limit - v_usage_count),
    'quota_reset_at', to_char(v_reset_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end;
$$;
