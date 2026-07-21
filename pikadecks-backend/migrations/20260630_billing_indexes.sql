-- Migration: Create high-traffic indexes for billing tables

CREATE INDEX IF NOT EXISTS idx_user_subs_user_id ON public.user_subscriptions(user_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subs_token ON public.user_subscriptions(purchase_token_sha256);
CREATE INDEX IF NOT EXISTS idx_billing_events_event_type ON public.billing_events(event_type, event_time DESC);
