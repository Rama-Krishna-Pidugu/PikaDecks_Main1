-- PikaDecks spaced repetition upgrade.
-- Run this in Supabase SQL editor before deploying the SRS backend routes.

create extension if not exists pgcrypto;

do $$ begin
  create type public.learning_state as enum ('new', 'learning', 'review', 'relearning');
exception
  when duplicate_object then null;
end $$;

alter table public.reviews
  add column if not exists deck_id uuid references public.decks(deck_id) on delete cascade,
  add column if not exists repetitions integer not null default 0,
  add column if not exists lapses integer not null default 0,
  add column if not exists learning_state public.learning_state not null default 'new',
  add column if not exists last_reviewed_at timestamp without time zone,
  add column if not exists next_review_at timestamp without time zone default now(),
  add column if not exists created_at timestamp without time zone default now(),
  add column if not exists updated_at timestamp without time zone default now();

update public.reviews r
set
  deck_id = c.deck_id,
  last_reviewed_at = coalesce(r.last_reviewed_at, r.last_reviewed),
  next_review_at = coalesce(r.next_review_at, r.next_review_date, now()),
  learning_state = case
    when coalesce(r.review_count, 0) = 0 then 'new'::public.learning_state
    else 'review'::public.learning_state
  end,
  repetitions = greatest(coalesce(r.repetitions, 0), coalesce(r.review_count, 0))
from public.cards c
where r.card_id = c.card_id
  and (r.deck_id is null or r.next_review_at is null or r.last_reviewed_at is null);

insert into public.reviews (
  user_id,
  deck_id,
  card_id,
  ease_factor,
  interval_days,
  repetitions,
  lapses,
  review_count,
  learning_state,
  next_review_at
)
select
  d.user_id,
  c.deck_id,
  c.card_id,
  2.5,
  0,
  0,
  0,
  0,
  'new'::public.learning_state,
  now()
from public.cards c
join public.decks d on d.deck_id = c.deck_id
where not exists (
  select 1
  from public.reviews r
  where r.user_id = d.user_id
    and r.card_id = c.card_id
);

alter table public.reviews
  alter column deck_id set not null,
  alter column next_review_at set not null,
  alter column ease_factor set default 2.5,
  alter column interval_days set default 0,
  alter column review_count set default 0;

delete from public.reviews r
using public.reviews newer
where r.user_id = newer.user_id
  and r.card_id = newer.card_id
  and r.ctid < newer.ctid;

do $$ begin
  alter table public.reviews
    add constraint reviews_user_card_unique unique (user_id, card_id);
exception
  when duplicate_object then null;
end $$;

alter table public.reviews
  drop constraint if exists reviews_learning_state_check;

alter table public.review_history
  add column if not exists reviewed_client_at timestamp without time zone,
  add column if not exists synced_at timestamp without time zone default now();

create index if not exists idx_reviews_user_due
  on public.reviews (user_id, next_review_at);

create index if not exists idx_reviews_deck_due
  on public.reviews (user_id, deck_id, next_review_at);

create index if not exists idx_reviews_user_state
  on public.reviews (user_id, learning_state);

create index if not exists idx_review_history_user_reviewed
  on public.review_history (user_id, reviewed_at desc);

create index if not exists idx_review_history_user_rating
  on public.review_history (user_id, rating, reviewed_at desc);

create index if not exists idx_cards_deck_order
  on public.cards (deck_id, card_order);

alter table public.reviews enable row level security;
alter table public.review_history enable row level security;

-- These policies are for direct Supabase Auth access. The Lambda backend uses
-- the service key and still performs Clerk ownership checks in application code.
drop policy if exists "Users can read their review state" on public.reviews;
create policy "Users can read their review state"
  on public.reviews for select
  using (auth.uid() = user_id);

drop policy if exists "Users can manage their review state" on public.reviews;
create policy "Users can manage their review state"
  on public.reviews for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their review history" on public.review_history;
create policy "Users can read their review history"
  on public.review_history for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their review history" on public.review_history;
create policy "Users can insert their review history"
  on public.review_history for insert
  with check (auth.uid() = user_id);
