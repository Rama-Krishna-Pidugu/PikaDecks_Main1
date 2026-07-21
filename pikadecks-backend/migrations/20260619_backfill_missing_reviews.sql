-- SQL Migration: Backfill missing review rows
-- Inserts a review record for any card that does not have one, making older cards reviewable.

INSERT INTO public.reviews (
  review_id,
  user_id,
  card_id,
  deck_id,
  ease_factor,
  interval_days,
  repetitions,
  lapses,
  review_count,
  learning_state,
  next_review_at,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  d.user_id,
  c.card_id,
  c.deck_id,
  2.5,
  0,
  0,
  0,
  0,
  'new'::public.learning_state,
  now(),
  now(),
  now()
FROM public.cards c
JOIN public.decks d ON c.deck_id = d.deck_id
LEFT JOIN public.reviews r ON c.card_id = r.card_id
WHERE r.review_id IS NULL;
