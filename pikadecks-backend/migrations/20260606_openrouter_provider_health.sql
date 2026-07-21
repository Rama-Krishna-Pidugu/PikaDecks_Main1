insert into public.provider_health (provider_name, max_concurrent_requests)
values ('openrouter', 1)
on conflict (provider_name) do nothing;
