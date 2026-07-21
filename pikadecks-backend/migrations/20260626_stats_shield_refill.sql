-- Add missing shield_refill_month column to user_stats table
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS shield_refill_month text;
