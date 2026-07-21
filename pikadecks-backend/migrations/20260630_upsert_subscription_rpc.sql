-- Migration: Transactional Subscription Upsert RPC
-- This ensures user_subscriptions and users.plan_type are updated in a single atomic transaction.

CREATE OR REPLACE FUNCTION public.upsert_subscription_transaction(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_plan_type TEXT;
  v_product_id TEXT;
  v_purchase_token TEXT;
  v_purchase_token_sha256 TEXT;
  v_transaction_id TEXT;
  v_package_name TEXT;
  v_platform TEXT;
  v_status TEXT;
  v_expires_at TIMESTAMP;
  v_purchase_time TIMESTAMP;
  v_auto_renewing BOOLEAN;
  v_active BOOLEAN;
  v_verified_at TIMESTAMP;
  
  result_record user_subscriptions%ROWTYPE;
BEGIN
  -- Extract from JSON payload
  v_user_id := (payload->>'user_id')::UUID;
  v_plan_type := COALESCE(payload->>'plan_type', 'pro');
  v_product_id := payload->>'product_id';
  v_purchase_token := payload->>'purchase_token';
  v_purchase_token_sha256 := payload->>'purchase_token_sha256';
  v_transaction_id := payload->>'transaction_id';
  v_package_name := payload->>'package_name';
  v_platform := COALESCE(payload->>'platform', 'android');
  v_status := payload->>'status';
  v_expires_at := (payload->>'expires_at')::TIMESTAMP;
  v_purchase_time := (payload->>'purchase_time')::TIMESTAMP;
  v_auto_renewing := (payload->>'auto_renewing')::BOOLEAN;
  v_active := (payload->>'active')::BOOLEAN;
  v_verified_at := (payload->>'verified_at')::TIMESTAMP;

  -- 1. Upsert subscription
  INSERT INTO public.user_subscriptions (
    user_id, plan_type, product_id, purchase_token, purchase_token_sha256,
    transaction_id, package_name, platform, status, expires_at, expiry_date,
    purchase_time, purchase_date, auto_renewing, active, verified_at, updated_at
  )
  VALUES (
    v_user_id, v_plan_type, v_product_id, v_purchase_token, v_purchase_token_sha256,
    v_transaction_id, v_package_name, v_platform, v_status, v_expires_at, v_expires_at,
    v_purchase_time, v_purchase_time, v_auto_renewing, v_active, v_verified_at, now()
  )
  ON CONFLICT (purchase_token_sha256) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    plan_type = EXCLUDED.plan_type,
    product_id = EXCLUDED.product_id,
    transaction_id = EXCLUDED.transaction_id,
    package_name = EXCLUDED.package_name,
    platform = EXCLUDED.platform,
    status = EXCLUDED.status,
    expires_at = EXCLUDED.expires_at,
    expiry_date = EXCLUDED.expiry_date,
    purchase_time = EXCLUDED.purchase_time,
    purchase_date = EXCLUDED.purchase_date,
    auto_renewing = EXCLUDED.auto_renewing,
    active = EXCLUDED.active,
    verified_at = EXCLUDED.verified_at,
    updated_at = now()
  RETURNING * INTO result_record;

  -- 2. Update users plan_type
  UPDATE public.users
  SET plan_type = (
    CASE WHEN v_active THEN 'pro' ELSE 'free' END
  )
  WHERE user_id = v_user_id;

  RETURN row_to_json(result_record)::jsonb;
END;
$$;
