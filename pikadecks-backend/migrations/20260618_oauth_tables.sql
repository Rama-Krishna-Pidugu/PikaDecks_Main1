-- SQL Migration: OAuth Tables Setup
-- Defines tables for OAuth clients, authorization codes, user grants, and refresh tokens.

-- 1. OAuth Clients Table
CREATE TABLE IF NOT EXISTS public.oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hash TEXT NULL, -- Nullable for public clients
  client_name TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- 2. OAuth Authorization Codes Table
CREATE TABLE IF NOT EXISTS public.oauth_codes (
  code TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- 3. OAuth User Grants Table (Consent)
CREATE TABLE IF NOT EXISTS public.oauth_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_id)
);

-- 4. Refresh Tokens Table (Hashed)
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires_at ON public.oauth_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON public.refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_grants_user_id ON public.oauth_grants(user_id);

-- Seed default clients for ChatGPT and Claude
INSERT INTO public.oauth_clients (client_id, client_secret_hash, client_name, redirect_uri, scopes, active)
VALUES 
  ('chatgpt', NULL, 'ChatGPT MCP Client', 'https://chatgpt.com/backend-api/aip/oauth/callback', '{"read:decks", "write:decks", "write:cards"}', true),
  ('claude', NULL, 'Claude MCP Client', 'https://claude.ai/oauth/callback', '{"read:decks", "write:decks", "write:cards"}', true),
  ('pikadecks_mcp_client', NULL, 'PikaDecks CLI MCP Client', 'http://localhost:8000/oauth/callback', '{"read:decks", "write:decks", "write:cards"}', true)
ON CONFLICT (client_id) DO UPDATE 
SET redirect_uri = EXCLUDED.redirect_uri, scopes = EXCLUDED.scopes, active = EXCLUDED.active;
