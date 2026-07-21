-- Rollback for 20260602_spaced_repetition.sql.
-- Run only if you need to remove the SRS database upgrade.
--
-- This keeps the original legacy review columns:
--   next_review_date, last_reviewed, ease_factor, interval_days, review_count
-- It removes the newer SRS columns, indexes, policies, and enum type.

drop policy if exists "Users can read their review state" on public.reviews;
drop policy if exists "Users can manage their review state" on public.reviews;
drop policy if exists "Users can read their review history" on public.review_history;
drop policy if exists "Users can insert their review history" on public.review_history;

drop index if exists public.idx_reviews_user_due;
drop index if exists public.idx_reviews_deck_due;
drop index if exists public.idx_reviews_user_state;
drop index if exists public.idx_review_history_user_reviewed;
drop index if exists public.idx_review_history_user_rating;
drop index if exists public.idx_cards_deck_order;

alter table if exists public.reviews
  drop constraint if exists reviews_user_card_unique;

alter table if exists public.reviews
  alter column deck_id drop not null,
  alter column next_review_at drop not null;

alter table if exists public.review_history
  drop column if exists reviewed_client_at,
  drop column if exists synced_at;

alter table if exists public.reviews
  drop column if exists deck_id,
  drop column if exists repetitions,
  drop column if exists lapses,
  drop column if exists learning_state,
  drop column if exists last_reviewed_at,
  drop column if exists next_review_at,
  drop column if exists created_at,
  drop column if exists updated_at;

do $$ begin
  drop type if exists public.learning_state;
exception
  when dependent_objects_still_exist then null;
end $$;
