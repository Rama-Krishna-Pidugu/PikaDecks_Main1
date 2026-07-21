-- Add streak freeze columns to user_stats table
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS streak_freeze_count integer DEFAULT 0;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS streak_freeze_active boolean DEFAULT false;
