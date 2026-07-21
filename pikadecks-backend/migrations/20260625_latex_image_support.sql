-- Add LaTeX and Image support schema changes

-- Add notes_content and notes_image_urls to decks table
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS notes_content TEXT;
ALTER TABLE public.decks ADD COLUMN IF NOT EXISTS notes_image_urls TEXT[];

-- Add notes_image_url to cards table
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS notes_image_url TEXT;

-- Add image_url and notes_image_url to generated_cards table to preserve them during pipeline processing
ALTER TABLE public.generated_cards ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.generated_cards ADD COLUMN IF NOT EXISTS notes_image_url TEXT;
