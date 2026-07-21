-- SQL Migration: MCP Usage Events Table
-- Creates table to track client-specific MCP usage.

CREATE TABLE IF NOT EXISTS public.mcp_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
    deck_id UUID REFERENCES public.decks(deck_id) ON DELETE SET NULL,
    cards_created INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mcp_usage_events_user_client_date ON public.mcp_usage_events(user_id, client_id, created_at);
