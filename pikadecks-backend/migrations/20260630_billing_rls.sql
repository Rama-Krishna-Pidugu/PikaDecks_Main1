-- Migration: Enable RLS and Policies for Billing Tables

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- 1. Policy for user_subscriptions (Users can only read their own subscriptions)
CREATE POLICY "Users can only read their own subscriptions"
ON public.user_subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- 2. Policy for user_subscriptions (Service Role full access - implicit for service_role, but good to be explicit if using custom roles)
-- Supabase automatically bypasses RLS for the service_role and postgres roles.

-- 3. Policy for billing_events
-- No public/user access to billing_events. Only service_role can insert/read.
CREATE POLICY "No public access to billing_events"
ON public.billing_events
FOR ALL
USING (false);
