CREATE TABLE IF NOT EXISTS public.processed_pubsub_messages (
  message_id text PRIMARY KEY,
  received_at timestamp without time zone NOT NULL DEFAULT now(),
  event_type text,
  purchase_token_hash text
);
