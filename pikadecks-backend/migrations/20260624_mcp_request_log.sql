-- SQL Migration: MCP Request Log Table
-- Creates table to track idempotency keys and cache responses.

CREATE TABLE IF NOT EXISTS public.mcp_request_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    response JSONB,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_mcp_request_log_key ON public.mcp_request_log(idempotency_key);
