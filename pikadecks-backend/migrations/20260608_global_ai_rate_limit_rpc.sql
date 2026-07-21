-- Global AI provider throttle.
-- Reserves one outbound AI request and an estimated token budget atomically.

create or replace function public.consume_ai_rate_limit(
  p_provider_name text,
  p_request_tokens integer,
  p_request_limit integer default 10,
  p_token_limit integer default 30000,
  p_minute_window_seconds integer default 60,
  p_token_window_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public 
as $$
declare
  v_now timestamp without time zone := (now() at time zone 'utc');
  v_minute_window_start timestamp without time zone := date_trunc('minute', (now() at time zone 'utc'));
  v_token_window_start timestamp without time zone := (
    date_trunc('hour', (now() at time zone 'utc'))
    + make_interval(mins => ((extract(minute from (now() at time zone 'utc'))::integer / 5) * 5))
  );
  v_request_count integer := 0;
  v_token_count integer := 0;
  v_request_limit integer := least(30, greatest(1, coalesce(p_request_limit, 10)));
  v_token_limit integer := greatest(1, coalesce(p_token_limit, 30000));
  v_request_tokens integer := greatest(1, coalesce(p_request_tokens, 1));
begin
  perform pg_advisory_xact_lock(hashtext('pikadecks_global_ai_rate_limit'));

  select coalesce(request_count, 0)
    into v_request_count
    from public.rate_limit_buckets
    where scope = 'global'
      and scope_key = 'all'
      and provider_name = '_all'
      and window_start = v_minute_window_start
      and window_seconds = p_minute_window_seconds
    for update;

  select coalesce(token_count, 0)
    into v_token_count
    from public.rate_limit_buckets
    where scope = 'global'
      and scope_key = 'all'
      and provider_name = '_all'
      and window_start = v_token_window_start
      and window_seconds = p_token_window_seconds
    for update;

  if coalesce(v_request_count, 0) + 1 > v_request_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'requests_per_minute',
      'request_count', coalesce(v_request_count, 0),
      'request_limit', v_request_limit,
      'retry_after_seconds', greatest(1, 60 - extract(second from v_now)::integer)
    );
  end if;

  if coalesce(v_token_count, 0) + v_request_tokens > v_token_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'tokens_per_5_minutes',
      'token_count', coalesce(v_token_count, 0),
      'token_limit', v_token_limit,
      'request_tokens', v_request_tokens,
      'retry_after_seconds', greatest(1, 300 - (
        extract(epoch from (v_now - v_token_window_start))::integer
      ))
    );
  end if;

  insert into public.rate_limit_buckets (
    scope,
    scope_key,
    provider_name,
    window_start,
    window_seconds,
    request_count,
    token_count,
    limit_requests,
    limit_tokens,
    updated_at
  )
  values (
    'global',
    'all',
    '_all',
    v_minute_window_start,
    p_minute_window_seconds,
    1,
    0,
    v_request_limit,
    null,
    v_now
  )
  on conflict (scope, scope_key, provider_name, window_start, window_seconds)
  do update set
    request_count = public.rate_limit_buckets.request_count + 1,
    limit_requests = v_request_limit,
    updated_at = v_now;

  insert into public.rate_limit_buckets (
    scope,
    scope_key,
    provider_name,
    window_start,
    window_seconds,
    request_count,
    token_count,
    limit_requests,
    limit_tokens,
    updated_at
  )
  values (
    'global',
    'all',
    '_all',
    v_token_window_start,
    p_token_window_seconds,
    0,
    v_request_tokens,
    null,
    v_token_limit,
    v_now
  )
  on conflict (scope, scope_key, provider_name, window_start, window_seconds)
  do update set
    token_count = public.rate_limit_buckets.token_count + v_request_tokens,
    limit_tokens = v_token_limit,
    updated_at = v_now;

  return jsonb_build_object(
    'allowed', true,
    'request_count', coalesce(v_request_count, 0) + 1,
    'request_limit', v_request_limit,
    'token_count', coalesce(v_token_count, 0) + v_request_tokens,
    'token_limit', v_token_limit,
    'request_tokens', v_request_tokens
  );
end;
$$;
