# Production PDF Flashcard Pipeline

This design targets concurrent PDF uploads, user-private caching, provider rate-limit safety, and lower LLM cost.

## Current State

The backend already has:

- React Native upload flow using presigned S3 upload.
- FastAPI `/uploads/process-async` API.
- SQS queues for upload orchestration, Gemini chunks, Groq chunks, and reduction.
- Worker Lambdas in `app/pipeline_workers.py`.
- Provider abstraction in `app/services/ai_orchestrator.py`.
- Supabase status tables: `uploads`, `generation_jobs`, `generation_chunks`, `chunk_summaries`, `extracted_concepts`, `generated_cards`, `processing_events`, `provider_health`.
- Groq/Gemini chunk processing with retry/failover.

Remaining production gaps:

- User-level generation cache is not wired into the worker path yet.
- Token/cost usage is only partially captured.
- Provider throttling is health-aware, but not yet backed by strict per-minute token/request buckets.
- OCR cache is not implemented.
- DLQ replay tooling and provider dashboards are still needed.

## Target Architecture

```text
React Native
  |
  | 1. request presigned URL
  v
FastAPI Upload API
  |
  | 2. upload PDF directly
  v
S3
  |
  | 3. create uploads + generation_jobs
  v
UploadProcessingQueue
  |
  v
Upload Orchestrator Worker
  |
  | validate page count, download PDF, extract text, token estimate
  | compute user-scoped content hash
  | check user_generation_cache
  |
  +-- cache hit -> create deck/cards -> completed
  |
  +-- cache miss -> semantic chunks -> generation_chunks
                      |
                      +-- GroqGenerationQueue
                      +-- GeminiGenerationQueue
                              |
                              v
                         Provider Workers
                              |
                              | summaries + concepts + staged cards
                              v
                         ReduceQueue
                              |
                              v
                         Reducer Worker
                              |
                              | dedupe, quality filter, save deck/cards
                              | write user_generation_cache
                              v
                         Push/In-app notification
```

## Privacy-Safe Cache Strategy

Never reuse generated cards across users.

Cache key:

```text
user_id + normalized_content_hash + generation_settings_hash
```

`normalized_content_hash` is computed after extraction, cleaning, whitespace normalization, and boilerplate trimming. It is not a raw PDF hash, because the same PDF bytes can contain metadata changes while the extracted content is identical.

Recommended normalization:

```python
def normalized_content_hash(extracted_text: str) -> str:
    text = clean_and_trim_text(extracted_text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return sha256(text.encode("utf-8")).hexdigest()
```

`generation_settings_hash` should include:

- requested card count
- app generation version
- prompt version
- supported card types
- language, if added later

Cache behavior:

- Same user, same content/settings: clone cards into a new deck or return existing deck based on UX choice.
- Different user, same content/settings: process independently.
- Cache should store generated cards as JSON and provider/token metadata.
- Cache should be invalidated by changing the prompt/generation version.

## Token-Aware Routing

After extraction:

```text
small  <= 8k estimated tokens
medium <= 40k estimated tokens
large  > 40k estimated tokens
```

Rules:

- Small: direct chunk worker with 1 chunk.
- Medium: semantic chunks, low parallelism.
- Large: semantic chunks, provider queues, map-reduce summarization.
- Never send full large text to Groq/Gemini in one request.

Chunk target:

```text
2,000-4,000 tokens per chunk
max 6,000 tokens hard cap
```

For the current free plan, validate before expensive processing:

```text
Free: max 150 pages, max 30 cards
Premium future: 500+ pages, higher cards, higher priority
```

## Provider Routing

Business priority says:

```text
Primary: Groq
Secondary: Gemini
```

Recommended routing:

- Default route: Groq first while healthy and inside limits.
- Use Gemini for overflow, Groq rate limits, Groq 5xx, or Groq circuit open.
- If Gemini also fails/rate-limits, requeue with delay instead of failing the whole upload immediately.

Provider states in `provider_health`:

```text
CLOSED    healthy, can receive traffic
OPEN      unhealthy, stop routing until cooldown_until
HALF_OPEN test one request after cooldown
```

Circuit breaker:

```text
5 failures in 5 minutes -> OPEN for 10 minutes
1 success in HALF_OPEN -> CLOSED
1 failure in HALF_OPEN -> OPEN again
```

Retry policy:

```text
Retry 1: 2s + jitter
Retry 2: 5s + jitter
Retry 3: 10s + jitter
After retries:
  Groq chunk -> Gemini
  Gemini chunk -> delayed requeue if Groq unhealthy, else Groq
```

## Rate-Limit Protection

Use `rate_limit_buckets` for:

- `scope=user`: per-user PDF generation requests and tokens.
- `scope=global`: whole app traffic.
- `scope=provider`: provider RPM/TPM.

Before sending a provider request:

1. Estimate prompt tokens.
2. Check provider bucket.
3. If under limit, reserve tokens.
4. If over limit, requeue chunk with delay.
5. On provider response, record real tokens in `provider_usage_events`.

Initial conservative limits:

```text
Groq max concurrent chunk workers: 1-2 per stage
Gemini max concurrent chunk workers: 1-2 per stage
Chunk worker batchSize: 1
Upload worker batchSize: 1
Reducer batchSize: 1
```

Increase only after CloudWatch/Sentry proves stable.

## Sequence Diagrams

### Cache Hit

```text
User -> FastAPI: process-async(file_url, num_cards)
FastAPI -> Supabase: create upload/job
FastAPI -> SQS: enqueue upload job
Worker -> S3: download PDF
Worker -> PDF parser/OCR: extract text
Worker -> Supabase: lookup user_generation_cache(user_id, content_hash, settings_hash)
Supabase --> Worker: cached cards
Worker -> Supabase: create deck/cards, mark upload completed cache_hit=true
Worker -> Notifications: flashcards ready
Frontend -> FastAPI: poll status
FastAPI --> Frontend: COMPLETED deck_id
```

### Cache Miss

```text
User -> FastAPI: process-async
FastAPI -> Supabase: uploads/generation_jobs PENDING
FastAPI -> UploadProcessingQueue: message
UploadWorker -> S3: download
UploadWorker -> Parser/OCR: extract
UploadWorker -> Supabase: no user cache
UploadWorker -> Supabase: generation_chunks
UploadWorker -> GroqQueue/GeminiQueue: chunk messages
ProviderWorker -> Provider: generate artifacts
ProviderWorker -> Supabase: summaries/concepts/generated_cards/provider_usage_events
ProviderWorker -> ReduceQueue: when chunks complete
Reducer -> Supabase: dedupe/validate/create deck/cards/cache
Reducer -> Notifications: ready/failure
```

### Rate Limit Failover

```text
GroqWorker -> Groq: chunk request
Groq --> GroqWorker: 429
GroqWorker -> Sentry: provider_rate_limited
GroqWorker -> provider_health: failure_count + cooldown
GroqWorker -> GeminiQueue: same chunk with delay
GeminiWorker -> Gemini: chunk request
Gemini --> GeminiWorker: success
GeminiWorker -> Supabase: chunk completed
```

## Supabase Schema

Core tables already exist in `20260605_ai_orchestration_pipeline.sql`.

Additional production tables are in:

```text
migrations/20260605_user_generation_cache_and_provider_usage.sql
```

Adds:

- `user_generation_cache`
- `text_extraction_cache`
- `provider_usage_events`
- `rate_limit_buckets`
- cache/status columns on `uploads`
- cache/token columns on `generation_jobs`

Important indexes:

```sql
create index idx_user_generation_cache_lookup
  on user_generation_cache (user_id, content_hash, generation_settings_hash);

create index idx_provider_usage_provider_created
  on provider_usage_events (provider_name, created_at desc);

create index idx_rate_limit_buckets_scope
  on rate_limit_buckets (scope, scope_key, provider_name, window_start desc);
```

## FastAPI Implementation Plan

### Upload API

`POST /uploads/process-async`

- Validate auth.
- Enforce daily user limit.
- Create upload row.
- Create generation job row with `queue_entered_at`.
- Send SQS message.
- Return immediately.

### Status API

`GET /uploads/{upload_id}/status`

Return:

```json
{
  "status": "GENERATING_CARDS",
  "progress": 62,
  "error": null,
  "deck_id": null
}
```

### Abort API

`POST /uploads/{upload_id}/abort`

- Mark upload/job/chunks cancelled.
- Workers skip cancelled jobs.

## Worker Design

### Upload Orchestrator

Pseudocode:

```python
def upload_worker(message):
    upload = load_upload(message.upload_id)
    if cancelled(upload): return

    mark_stage("VALIDATING")
    pdf = download_from_s3(upload.file_url)
    page_count = count_pages(pdf)
    enforce_plan_limits(user, page_count)

    file_hash = sha256(pdf).hexdigest()
    extraction = lookup_text_extraction_cache(user_id, file_hash)
    if extraction:
        text = load_cached_text(extraction)
    else:
        text = extract_text_or_ocr(pdf)
        save_text_extraction_cache(user_id, file_hash, text)

    content_hash = normalized_content_hash(text)
    settings_hash = generation_settings_hash(requested_cards, prompt_version)
    cached = lookup_user_generation_cache(user_id, content_hash, settings_hash)
    if cached:
        deck = clone_cached_cards_to_deck(cached)
        mark_completed(cache_hit=True, deck_id=deck.id)
        notify_user()
        return

    token_count = estimate_tokens(text)
    size_class = classify(token_count)
    chunks = semantic_chunk(text, token_count)
    save_generation_chunks(chunks)
    enqueue_chunks(chunks, strategy="openrouter_primary_gemini_secondary")
```

### Provider Worker

```python
def provider_worker(chunk, provider):
    if cancelled(chunk.upload_id): return
    if provider_circuit_open(provider):
        requeue_or_alternate(chunk)
        return
    if would_exceed_rate_limit(provider, chunk.token_estimate):
        requeue_with_delay(chunk)
        return

    try:
        reserve_rate_limit(provider, chunk.token_estimate)
        result = call_provider(provider, chunk.text)
        save_summary_concepts_cards(result)
        record_provider_usage(result)
        mark_chunk_completed()
    except RateLimit:
        record_sentry("provider_rate_limited")
        open_or_increment_circuit(provider)
        enqueue_alternate_provider(chunk)
    except ProviderUnavailable:
        retry_with_backoff_or_dlq(chunk)
    finally:
        enqueue_reducer_if_all_chunks_terminal()
```

### Reducer Worker

```python
def reducer_worker(job):
    if cancelled(job.upload_id): return
    cards = load_generated_cards(job)
    cards = dedupe(cards)
    cards = quality_filter(cards)
    if not enough(cards):
        fail_job("NO_VALID_CARDS")
        return

    deck = create_deck()
    save_final_cards(deck, cards)
    save_user_generation_cache(user_id, content_hash, settings_hash, cards)
    mark_completed(deck.id)
    notify_user()
```

## Cost Controls

- Cache extraction by `(user_id, file_hash)`.
- Cache generation by `(user_id, content_hash, generation_settings_hash)`.
- Chunk before LLM.
- Cap cards per chunk.
- Store generated artifacts and reduce locally.
- Do not rerun OCR for identical same-user PDF.
- Use low temperature and JSON mode to reduce retry waste.
- Track token usage per provider/job/chunk.

## Monitoring

Track these in `provider_usage_events`, `processing_events`, Sentry, and CloudWatch:

- queue wait time: `worker_started_at - queue_entered_at`
- processing time: `completed_at - worker_started_at`
- prompt/completion tokens
- estimated cost
- provider/model
- retries/fallbacks
- rate-limit failures
- DLQ messages
- cache hit rate
- OCR/extraction failures
- no-valid-card failures

Sentry tags:

```text
feature=ai_generation
action=provider_rate_limited|provider_generation_failed|pipeline_worker_unhandled_failure
provider=groq|gemini
upload_id=...
job_id=...
chunk_id=...
error_code=...
```

CloudWatch alarms:

- Any DLQ visible messages > 0.
- Provider 429 count above threshold.
- Worker errors above threshold.
- Queue age above threshold.
- Cache hit rate unexpectedly drops.

## Deployment Recommendations

- Keep API Lambda timeout near HTTP API limits, but never process PDFs there.
- Use SQS batch size `1` for LLM workers.
- Start with low concurrency per provider.
- Increase concurrency only after observing TPM/RPM stability.
- Store Supabase URL and FCM service JSON in SSM Parameter Store.
- Keep provider keys in GitHub/AWS secrets, not source.
- Separate test/prod queues and provider limits.
- Add DLQ replay scripts before enabling high traffic.

## Implementation Roadmap

1. Run both migrations:
   - `20260605_ai_orchestration_pipeline.sql`
   - `20260605_user_generation_cache_and_provider_usage.sql`
2. Wire `content_hash` and `generation_settings_hash` into upload worker.
3. Add user-generation-cache lookup before chunk creation.
4. Add cache write in reducer after successful deck/card creation.
5. Add provider usage writes after every provider call.
6. Add strict rate-limit bucket checks before provider calls.
7. Add DLQ replay and inspection commands.
8. Add CloudWatch dashboard and Sentry alert rules.
9. Tune chunk size and worker concurrency from real token/latency data.

## Key Principle

The system should fail at the smallest recoverable unit:

```text
One provider request failed -> retry/fallback one chunk
One chunk failed -> continue other chunks
One user repeats same file -> same-user cache hit
Another user uploads same file -> independent private processing
```
