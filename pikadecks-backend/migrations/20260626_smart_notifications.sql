-- Add tracking fields for adaptive notification frequency and smart timing
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS consecutive_ignored_days integer DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS preferred_study_hour integer;
