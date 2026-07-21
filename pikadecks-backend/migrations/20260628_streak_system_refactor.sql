-- Migration: Production streak restore state machine
-- Date: 2026-06-28

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_streaks (
    user_id uuid PRIMARY KEY,
    status text NOT NULL DEFAULT 'BROKEN' CHECK (status IN ('ACTIVE', 'FROZEN', 'BROKEN')),
    current_streak integer NOT NULL DEFAULT 0,
    longest_streak integer NOT NULL DEFAULT 0,
    protected_streak_value integer NOT NULL DEFAULT 0,
    last_study_date date,
    last_qualified_study_at timestamp with time zone,
    last_qualified_study_local_date date,
    user_timezone text NOT NULL DEFAULT 'UTC',
    freeze_started_at timestamp with time zone,
    freeze_expires_at timestamp with time zone,
    broken_at timestamp with time zone,
    restore_tokens_earned integer NOT NULL DEFAULT 0,
    restore_tokens_monthly integer NOT NULL DEFAULT 0,
    monthly_restore_count integer NOT NULL DEFAULT 0,
    last_refill_month text,
    last_restore_at timestamp with time zone,
    shield_count integer NOT NULL DEFAULT 0,
    last_shield_refill_month text,
    last_shield_used_at timestamp with time zone,
    shield_used_for_local_date date,
    earned_restore_token_milestone integer NOT NULL DEFAULT 0,
    total_study_days integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT user_streaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

ALTER TABLE public.user_streaks
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'BROKEN',
    ADD COLUMN IF NOT EXISTS protected_streak_value integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_qualified_study_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS last_qualified_study_local_date date,
    ADD COLUMN IF NOT EXISTS user_timezone text NOT NULL DEFAULT 'UTC',
    ADD COLUMN IF NOT EXISTS freeze_started_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS freeze_expires_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS broken_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS monthly_restore_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_restore_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS shield_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_shield_refill_month text,
    ADD COLUMN IF NOT EXISTS last_shield_used_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS shield_used_for_local_date date,
    ADD COLUMN IF NOT EXISTS earned_restore_token_milestone integer NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_streaks_status_check'
    ) THEN
        ALTER TABLE public.user_streaks
            ADD CONSTRAINT user_streaks_status_check CHECK (status IN ('ACTIVE', 'FROZEN', 'BROKEN'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.streak_events (
    event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    previous_status text,
    next_status text,
    previous_streak integer NOT NULL DEFAULT 0,
    next_streak integer NOT NULL DEFAULT 0,
    streak_value integer NOT NULL DEFAULT 0,
    study_session_id uuid,
    idempotency_key text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT streak_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

ALTER TABLE public.streak_events
    ADD COLUMN IF NOT EXISTS previous_status text,
    ADD COLUMN IF NOT EXISTS next_status text,
    ADD COLUMN IF NOT EXISTS previous_streak integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_streak integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS study_session_id uuid,
    ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS streak_events_user_id_idempotency_key_idx
    ON public.streak_events(user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.study_sessions (
    session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    cards_reviewed integer NOT NULL DEFAULT 0,
    minutes_studied numeric NOT NULL DEFAULT 0,
    qualified_for_streak boolean NOT NULL DEFAULT false,
    qualification_reason text,
    client_session_id text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT study_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS study_sessions_user_client_session_idx
    ON public.study_sessions(user_id, client_session_id)
    WHERE client_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.streak_config (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    environment text NOT NULL DEFAULT 'production',
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.streak_config(key, value)
VALUES
    ('daily_goal', '{"cards_required": 10, "minutes_required": 10, "mode": "cards_or_minutes"}'::jsonb),
    ('grace_period', '{"hours": 24}'::jsonb),
    ('restore_limits', '{"free": 1, "pro": 5, "enterprise": null}'::jsonb),
    ('shield_limits', '{"free": 0, "pro": 5, "enterprise": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
    IF to_regclass('public.streak_tracking') IS NOT NULL THEN
        INSERT INTO public.user_streaks (
            user_id,
            status,
            current_streak,
            longest_streak,
            protected_streak_value,
            last_study_date,
            last_qualified_study_local_date,
            total_study_days,
            restore_tokens_monthly,
            last_refill_month,
            created_at,
            updated_at
        )
        SELECT
            st.user_id,
            CASE WHEN COALESCE(st.current_streak, 0) > 0 THEN 'ACTIVE' ELSE 'BROKEN' END,
            COALESCE(st.current_streak, 0),
            COALESCE(st.longest_streak, 0),
            COALESCE(st.current_streak, 0),
            st.last_study_date,
            st.last_study_date,
            COALESCE(us.study_days, 0),
            COALESCE(us.streak_freeze_count, 0),
            us.shield_refill_month,
            now(),
            now()
        FROM public.streak_tracking st
        LEFT JOIN public.user_stats us ON st.user_id = us.user_id
        ON CONFLICT (user_id) DO UPDATE SET
            current_streak = EXCLUDED.current_streak,
            longest_streak = GREATEST(public.user_streaks.longest_streak, EXCLUDED.longest_streak),
            protected_streak_value = GREATEST(public.user_streaks.protected_streak_value, EXCLUDED.protected_streak_value),
            last_study_date = COALESCE(public.user_streaks.last_study_date, EXCLUDED.last_study_date),
            last_qualified_study_local_date = COALESCE(public.user_streaks.last_qualified_study_local_date, EXCLUDED.last_qualified_study_local_date),
            total_study_days = GREATEST(public.user_streaks.total_study_days, EXCLUDED.total_study_days),
            updated_at = now();
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_stats'
          AND column_name = 'current_streak'
    ) THEN
        INSERT INTO public.user_streaks (
            user_id,
            status,
            current_streak,
            longest_streak,
            protected_streak_value,
            total_study_days,
            restore_tokens_monthly,
            last_refill_month,
            created_at,
            updated_at
        )
        SELECT
            user_id,
            CASE WHEN COALESCE(current_streak, 0) > 0 THEN 'ACTIVE' ELSE 'BROKEN' END,
            COALESCE(current_streak, 0),
            COALESCE(longest_streak, 0),
            COALESCE(current_streak, 0),
            COALESCE(study_days, 0),
            COALESCE(streak_freeze_count, 0),
            shield_refill_month,
            now(),
            now()
        FROM public.user_stats
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END $$;

DROP TABLE IF EXISTS public.streak_tracking;

ALTER TABLE public.user_stats
    DROP COLUMN IF EXISTS current_streak,
    DROP COLUMN IF EXISTS longest_streak,
    DROP COLUMN IF EXISTS streak_freeze_count,
    DROP COLUMN IF EXISTS streak_freeze_active,
    DROP COLUMN IF EXISTS shield_refill_month;

COMMIT;
