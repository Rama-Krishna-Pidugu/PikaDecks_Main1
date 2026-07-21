-- SQL Migration: MCP System User Seed
-- Creates a dedicated system user for MCP access if it doesn't already exist.

INSERT INTO public.users (
  user_id,
  clerk_user_id,
  name,
  email,
  plan_type,
  account_status
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'clerk_mcp_system_user',
  'MCP System User',
  'mcp-system-user@pikadecks.local',
  'pro',
  'active'
) ON CONFLICT (user_id) DO NOTHING;
