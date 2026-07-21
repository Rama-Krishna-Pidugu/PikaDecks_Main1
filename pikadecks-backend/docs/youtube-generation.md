# YouTube Video Flashcard Generation

## API

### POST /youtube/generate

Authenticated endpoint. Starts an async YouTube transcript to flashcards job.

Request:

```json
{
  "url": "https://youtu.be/pSEtcx4EBB4",
  "num_cards": 10,
  "title": "Optional deck title",
  "languages": ["en"]
}
```

`url` accepts a full YouTube URL or a bare 11-character video ID. The API normalizes valid input to `https://youtu.be/{video_id}` before storing the generation job.

Response:

```json
{
  "success": true,
  "generation_id": "uuid",
  "status": "queued"
}
```

### GET /youtube/generation/{generation_id}

Authenticated endpoint. Returns only jobs owned by the current user.

Status values:

- `queued`
- `processing`
- `completed`
- `failed`

Processing stages:

- `QUEUED`
- `EXTRACTING_TRANSCRIPT`
- `PROCESSING_TRANSCRIPT`
- `SUMMARIZING`
- `GENERATING_CARDS`
- `CREATING_DECK`
- `COMPLETED`
- `FAILED`

## Processing Flow

```text
YouTube URL or video ID
-> transcript extraction
-> transcript normalization
-> transcript chunking
-> grouped summary calls
-> final flashcard generation
-> deduplication
-> private deck/cards/review rows
```

The pipeline uses Groq first for YouTube generation and Gemini as fallback when configured.

## Cache

YouTube cache is scoped by:

```text
user_id + transcript_hash + generation_settings_hash
```

Cached cards are never shared across users. A cache hit still creates a new private deck and new card rows for the same user.

## Observability

Provider calls emit `generation.provider_call` structured events with:

- `generation_id`
- `source`
- `provider`
- `call_type`
- `chunk_count`
- `token_estimate`

Chunk grouping emits `generation.chunk_grouping` with the planned provider call count.

## Environment

Required for deployment:

- `YOUTUBE_PROCESSING_QUEUE_URL`
- `YOUTUBE_TRANSCRIPTOR_RAPIDAPI_KEY`
- `OPENROUTER_GENERATION_QUEUE_URL`
- `OPENROUTER_API_KEY`

Optional:

- `GEMINI_API_KEY`
- `YOUTUBE_TRANSCRIPTOR_RAPIDAPI_HOST` defaults to `youtube-transcriptor.p.rapidapi.com`
- `YOUTUBE_CHUNK_CHAR_LIMIT`
- `YOUTUBE_SUMMARY_GROUP_TOKEN_LIMIT`
- `YOUTUBE_SUMMARY_GROUP_MAX_CHUNKS`
- `SUMMARY_GROUP_TOKEN_LIMIT`
- `SUMMARY_GROUP_MAX_CHUNKS`

Transcript extraction uses RapidAPI directly so cloud/server IP blocks from YouTube do not break generation.

## OpenRouter Provider

Provider priority is:

```text
Groq -> OpenRouter/Nvidia -> Gemini
```

To configure OpenRouter/Nvidia as the middle fallback provider:

```env
GROQ_MODEL=llama-3.3-70b-versatile
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openrouter/owl-alpha
OPENROUTER_REASONING_ENABLED=true
GEMINI_API_KEY=...
```

Do not set Groq to the OpenRouter model. Groq should use `GROQ_MODEL`; OpenRouter should use `OPENROUTER_MODEL`.
