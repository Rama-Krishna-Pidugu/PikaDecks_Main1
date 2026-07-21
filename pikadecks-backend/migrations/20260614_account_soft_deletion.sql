-- SQL Migration: Account Soft Deletion & Audit Logs
-- Adds soft deletion columns to the users table, creates an audit log table, and registers triggers for logging deletion-related actions.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS scheduled_deletion_at TIMESTAMP WITHOUT TIME ZONE NULL;

-- Create indexes for soft deletion queries
CREATE INDEX IF NOT EXISTS idx_users_soft_deleted
  ON public.users (is_deleted, scheduled_deletion_at);

-- Create account deletion audit log table
CREATE TABLE IF NOT EXISTS public.account_deletion_audit_log (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'deletion_requested', 'restored', 'permanently_deleted'
  requested_at TIMESTAMP WITHOUT TIME ZONE NULL,
  restored_at TIMESTAMP WITHOUT TIME ZONE NULL,
  permanent_deletion_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Trigger function for audit logging
CREATE OR REPLACE FUNCTION public.log_user_deletion_event()
RETURNS TRIGGER AS $$
BEGIN
  -- When user is soft-deleted
  IF (TG_OP = 'UPDATE' AND OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE) THEN
    INSERT INTO public.account_deletion_audit_log (user_id, action, requested_at)
    VALUES (NEW.user_id, 'deletion_requested', NEW.deleted_at);
  
  -- When user is restored
  ELSIF (TG_OP = 'UPDATE' AND OLD.is_deleted = TRUE AND NEW.is_deleted = FALSE) THEN
    INSERT INTO public.account_deletion_audit_log (user_id, action, restored_at)
    VALUES (NEW.user_id, 'restored', NOW());
  
  -- When user is permanently hard-deleted
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.account_deletion_audit_log (user_id, action, permanent_deletion_at)
    VALUES (OLD.user_id, 'permanently_deleted', NOW());
  END IF;
  
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS trg_user_deletion_audit ON public.users;
CREATE TRIGGER trg_user_deletion_audit
  AFTER UPDATE OR DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_deletion_event();
