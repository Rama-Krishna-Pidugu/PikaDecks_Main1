# Large PDF Flashcard Generation Pipeline

This document defines the production architecture for generating high-quality flashcards from PDFs at scale. The design is optimized for an educational flashcard product similar to Quizlet/Anki, with strong cost control, provider rate-limit protection, fault tolerance, and observability.

## Critical Design Decision

Do not use a simple provider fallback chain for normal processing.

The initial production implementation uses an AI orchestration layer with active workload distribution across:

- Gemini
- Groq

Chunks are assigned round-robin by default:

```text
Chunk 1 -> Gemini
Chunk 2 -> Groq
Chunk 3 -> Gemini
Chunk 4 -> Groq
```

Fallback is chunk-level only:

- Retry the failed chunk with the original provider.
- If retries are exhausted, move only that chunk to the alternate provider.
- Do not restart the whole PDF.
- Do not send every chunk to one provider.

Future providers such as OpenAI and Anthropic can be added behind the same provider interface, but only Gemini and Groq should be implemented initially.

## Goals

- Support 5-page, 100-page, 150-page, and 500+ page PDFs.
- Never send an entire PDF to an LLM.
- Preserve document context with semantic chunking and map-reduce summaries.
- Generate high-quality, deduplicated flashcards.
- Avoid repeated provider rate limits.
- Continue when individual chunks fail.
- Track progress at every stage.
- Provide user-safe errors and developer-rich diagnostics.

## Plan Limits

### Free Plan

- Maximum PDF pages: 150.
- Maximum generated flashcards: 30.
- Standard queue priority.
- Basic chunk summarization and card generation.

If a free user uploads more than 150 pages:

```text
Large PDF Detected

This document contains {page_count} pages.

Free plan supports PDFs up to 150 pages.

Upgrade to Premium to generate flashcards from larger documents with advanced AI processing.
```

Stop processing immediately after page-count validation. Do not enqueue extraction, OCR, or LLM work.

### Premium Plan

- 500+ pages.
- Higher flashcard limits.
- Priority processing.
- OCR and advanced map-reduce enabled.
- Higher concurrency and larger chunk budgets.

## Architecture Diagram

```text
Mobile App
  |
  v
API Lambda
  |
  |-- presigned upload URL
  v
S3 raw PDF storage
  |
  v
uploads + generation_jobs rows
  |
  v
validation_queue
  |
  v
validation_worker
  |
  |-- page count validation
  |-- plan limit check
  v
extraction_queue
  |
  v
extraction_worker
  |
  |-- text extraction
  |-- OCR routing when needed
  v
chunking_worker
  |
  |-- semantic chunks
  |-- generation_chunks rows
  v
round_robin_orchestrator
  |
  |-- chunk 1 -> openrouter_generation_queue
  |-- chunk 2 -> gemini_generation_queue
  |-- chunk 3 -> openrouter_generation_queue
  |-- chunk 4 -> gemini_generation_queue
  v
provider chunk workers
  |
  |-- chunk summaries
  |-- extracted concepts
  |-- generated candidate cards
  v
reduce_queue
  |
  v
reducer_worker
  |
  |-- map-reduce summaries
  |-- deduplication
  |-- quality validation
  |-- final card selection
  v
decks/cards/reviews rows
  |
  v
notification_queue
  |
  v
FCM/in-app notification
```

## AWS Services

- S3: raw PDF storage.
- API Gateway HTTP API: public backend API.
- Lambda:
  - API handler.
  - validation worker.
  - extraction worker.
  - chunking/orchestrator worker.
  - Gemini chunk worker.
  - Groq chunk worker.
  - reducer worker.
  - notification worker.
- SQS:
  - `validation_queue`
  - `extraction_queue`
  - `openrouter_generation_queue`
  - `gemini_generation_queue`
  - `groq_generation_queue`
  - `reduce_queue`
  - `notification_queue`
  - DLQ for each queue.
- EventBridge:
  - stale job sweeper.
  - provider health checks.
  - scheduled notifications.
- CloudWatch:
  - logs, metrics, dashboards, alarms.
- SSM Parameter Store:
  - Supabase URL.
  - FCM service account JSON.
  - provider API keys.
- Optional premium scale:
  - Textract for OCR.
  - Step Functions for highly complex 500+ page orchestration.

## Queue Design

```text
validation_queue
  -> validation_worker

extraction_queue
  -> extraction_worker

openrouter_generation_queue
  -> openrouter_chunk_worker

groq_generation_queue
  -> groq_chunk_worker

gemini_generation_queue
  -> gemini_chunk_worker

reduce_queue
  -> reducer_worker

notification_queue
  -> notification_worker
```

Recommended queue settings:

- Chunk queues: batch size 1.
- Visibility timeout: worker timeout + 60 seconds.
- DLQ max receive count: 3.
- Provider queues should have separate Lambda reserved concurrency.
- Premium queue can use higher reserved concurrency than free queue.

## Provider Distribution

Default distribution:

```text
Gemini: 50%
Groq: 50%
```

Round-robin assignment:

```python
providers = ["openrouter", "gemini", "groq"]
provider = providers[chunk_index % len(providers)]
```

Dynamic adjustment can reduce or pause traffic when:

- Provider quota is low.
- Failure rate increases.
- Latency increases.
- Provider circuit opens.
- Queue depth is too high.

The orchestrator must never route all chunks to one provider unless all other providers are unhealthy.

## Provider Health and Circuit Breaker

Provider states:

- `CLOSED`: healthy, send traffic.
- `OPEN`: unhealthy, do not send traffic.
- `HALF_OPEN`: send a small health-check request.

Circuit rule:

```text
5 failures in 5 minutes
-> mark provider OPEN
-> cooldown 10 minutes
-> switch to HALF_OPEN
-> one successful request closes circuit
-> one failed request reopens circuit
```

Provider health table:

```sql
create table if not exists public.provider_health (
  provider_name text primary key,
  status text not null default 'CLOSED'
    check (status in ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_count integer not null default 0,
  success_count integer not null default 0,
  average_latency_ms integer,
  requests_last_minute integer not null default 0,
  tokens_last_minute integer not null default 0,
  tokens_today integer not null default 0,
  daily_token_limit integer,
  concurrent_requests integer not null default 0,
  max_concurrent_requests integer not null default 1,
  last_success timestamp without time zone,
  last_failure timestamp without time zone,
  cooldown_until timestamp without time zone,
  updated_at timestamp without time zone not null default now()
);
```

## Rate Limit Protection

Track per provider:

- RPM.
- TPM.
- Daily token quota.
- Active concurrent requests.
- Queue depth.
- Recent failures.
- Average latency.

Do not hardcode a single delay. Calculate dispatch delay from provider state.

Example:

```python
def calculate_dispatch_delay(provider):
    rpm_pressure = provider.requests_last_minute / provider.rpm_limit
    tpm_pressure = provider.tokens_last_minute / provider.tpm_limit
    concurrency_pressure = provider.concurrent_requests / provider.max_concurrent_requests
    quota_pressure = provider.tokens_today / provider.daily_token_limit
    pressure = max(rpm_pressure, tpm_pressure, concurrency_pressure, quota_pressure)

    if pressure >= 0.95:
        return 30_000
    if pressure >= 0.80:
        return 5_000
    if pressure >= 0.60:
        return 1_000
    return 250
```

Adaptive backoff:

```text
Retry 1 -> 2 seconds
Retry 2 -> 5 seconds
Retry 3 -> 10 seconds
After retry exhaustion -> alternate provider
```

429 and quota errors should immediately update provider health and throttle future dispatches.

## Processing Pipeline

```text
Upload PDF
-> S3 storage
-> job creation
-> page count validation
-> OCR/text extraction
-> semantic chunking
-> chunk storage
-> provider round-robin
-> chunk summaries
-> map-reduce summaries
-> concept extraction
-> candidate flashcards
-> deduplication
-> quality validation
-> final flashcards
-> user notification
```

## Progress Stages

```text
UPLOADED
VALIDATING
EXTRACTING
CHUNKING
SUMMARIZING
EXTRACTING_CONCEPTS
GENERATING_CARDS
DEDUPLICATING
VALIDATING_CARDS
COMPLETED
FAILED
```

Progress formula:

```text
UPLOADED: 0-5
VALIDATING: 5-10
EXTRACTING: 10-25
CHUNKING: 25-35
SUMMARIZING: 35-55
EXTRACTING_CONCEPTS: 55-65
GENERATING_CARDS: 65-85
DEDUPLICATING: 85-92
VALIDATING_CARDS: 92-98
COMPLETED: 100
FAILED: 100
```

## Error Codes

```text
PREMIUM_REQUIRED
PDF_DOWNLOAD_FAILED
PDF_EXTRACTION_FAILED
OCR_FAILED
INVALID_PDF
PDF_TOO_LARGE
LLM_RATE_LIMIT
LLM_TIMEOUT
JSON_INVALID
NO_VALID_CARDS
DB_INSERT_FAILED
PROVIDER_UNAVAILABLE
QUEUE_FAILED
NOTIFICATION_FAILED
```

Recovery strategy:

| Error | User message | Recovery |
| --- | --- | --- |
| `PREMIUM_REQUIRED` | Upgrade required for this page count. | Stop processing, show upgrade path. |
| `PDF_DOWNLOAD_FAILED` | Document processing failed. Please try again later. | Retry storage read, inspect S3/IAM. |
| `PDF_EXTRACTION_FAILED` | Unable to extract readable text. | Try OCR for premium, otherwise fail safely. |
| `OCR_FAILED` | Unable to read this scanned document. | Retry OCR or ask user for text-based PDF. |
| `INVALID_PDF` | Please upload a valid PDF. | Stop. |
| `PDF_TOO_LARGE` | PDF exceeds plan limit. | Stop or upsell. |
| `LLM_RATE_LIMIT` | AI generation is temporarily busy. | Retry chunk, alternate provider, cooldown provider. |
| `LLM_TIMEOUT` | AI generation is taking longer than expected. | Retry chunk, alternate provider. |
| `JSON_INVALID` | Document processing failed. | Retry with repair prompt, alternate provider. |
| `NO_VALID_CARDS` | Could not generate useful cards. | Try more chunks, then fail. |
| `DB_INSERT_FAILED` | Document processing failed. | Retry reducer with idempotency key. |
| `PROVIDER_UNAVAILABLE` | AI generation is temporarily busy. | Circuit breaker and alternate provider. |
| `QUEUE_FAILED` | Document processing failed. | Retry enqueue, DLQ alert. |
| `NOTIFICATION_FAILED` | No user-visible job failure. | Log only, deactivate invalid token. |

## Database Schemas

### uploads

```sql
create table if not exists public.uploads (
  upload_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  file_url text not null,
  file_name text,
  file_type text,
  page_count integer,
  plan_at_upload text not null default 'free',
  processing_status text not null default 'pending',
  processing_stage text not null default 'UPLOADED',
  processing_progress integer not null default 0,
  processing_error_code text,
  processing_error_message text,
  deck_id uuid references public.decks(deck_id) on delete set null,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  completed_at timestamp without time zone
);

create index if not exists idx_uploads_user_created
  on public.uploads (user_id, created_at desc);
```

### generation_jobs

```sql
create table if not exists public.generation_jobs (
  job_id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(upload_id) on delete cascade,
  user_id uuid not null references public.users(user_id) on delete cascade,
  plan text not null default 'free',
  requested_cards integer not null default 10,
  page_count integer,
  status text not null default 'pending',
  stage text not null default 'UPLOADED',
  progress integer not null default 0,
  priority integer not null default 100,
  total_chunks integer not null default 0,
  completed_chunks integer not null default 0,
  failed_chunks integer not null default 0,
  total_prompt_tokens integer not null default 0,
  total_completion_tokens integer not null default 0,
  estimated_cost_usd numeric(10, 6) default 0,
  error_code text,
  error_message text,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  completed_at timestamp without time zone
);

create index if not exists idx_generation_jobs_user_created
  on public.generation_jobs (user_id, created_at desc);
create index if not exists idx_generation_jobs_status_priority
  on public.generation_jobs (status, priority, created_at);
```

### generation_chunks

```sql
create table if not exists public.generation_chunks (
  chunk_id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(job_id) on delete cascade,
  upload_id uuid not null references public.uploads(upload_id) on delete cascade,
  chunk_index integer not null,
  page_start integer,
  page_end integer,
  heading text,
  text_hash text not null,
  text_s3_key text,
  text_preview text,
  token_estimate integer,
  assigned_provider text,
  status text not null default 'pending',
  attempts integer not null default 0,
  fallback_count integer not null default 0,
  error_code text,
  error_message text,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  unique (job_id, chunk_index)
);

create index if not exists idx_generation_chunks_job_status
  on public.generation_chunks (job_id, status);
create index if not exists idx_generation_chunks_provider_status
  on public.generation_chunks (assigned_provider, status);
```

### chunk_summaries

```sql
create table if not exists public.chunk_summaries (
  summary_id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null references public.generation_chunks(chunk_id) on delete cascade,
  job_id uuid not null references public.generation_jobs(job_id) on delete cascade,
  provider_name text not null,
  summary text not null,
  key_points jsonb not null default '[]'::jsonb,
  prompt_tokens integer default 0,
  completion_tokens integer default 0,
  latency_ms integer,
  created_at timestamp without time zone not null default now()
);
```

### extracted_concepts

```sql
create table if not exists public.extracted_concepts (
  concept_id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(job_id) on delete cascade,
  chunk_id uuid references public.generation_chunks(chunk_id) on delete set null,
  concept_type text not null,
  term text not null,
  definition text,
  relationships jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  importance_score numeric default 0,
  created_at timestamp without time zone not null default now()
);

create index if not exists idx_extracted_concepts_job_type
  on public.extracted_concepts (job_id, concept_type);
```

### generated_cards

```sql
create table if not exists public.generated_cards (
  generated_card_id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(job_id) on delete cascade,
  chunk_id uuid references public.generation_chunks(chunk_id) on delete set null,
  concept_id uuid references public.extracted_concepts(concept_id) on delete set null,
  provider_name text,
  card_type text not null,
  question text not null,
  answer text not null,
  explanation text,
  normalized_question text,
  quality_score numeric default 0,
  duplicate_group text,
  status text not null default 'staged',
  rejection_reason text,
  created_at timestamp without time zone not null default now()
);

create index if not exists idx_generated_cards_job_status
  on public.generated_cards (job_id, status);
```

### processing_events

```sql
create table if not exists public.processing_events (
  event_id uuid primary key default gen_random_uuid(),
  job_id uuid references public.generation_jobs(job_id) on delete cascade,
  upload_id uuid references public.uploads(upload_id) on delete cascade,
  chunk_id uuid references public.generation_chunks(chunk_id) on delete set null,
  provider_name text,
  stage text not null,
  level text not null default 'info',
  code text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp without time zone not null default now()
);

create index if not exists idx_processing_events_job_created
  on public.processing_events (job_id, created_at desc);
```

### provider_health

```sql
create table if not exists public.provider_health (
  provider_name text primary key,
  status text not null default 'CLOSED'
    check (status in ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_count integer not null default 0,
  success_count integer not null default 0,
  average_latency_ms integer,
  requests_last_minute integer not null default 0,
  tokens_last_minute integer not null default 0,
  tokens_today integer not null default 0,
  daily_token_limit integer,
  concurrent_requests integer not null default 0,
  max_concurrent_requests integer not null default 1,
  last_success timestamp without time zone,
  last_failure timestamp without time zone,
  cooldown_until timestamp without time zone,
  updated_at timestamp without time zone not null default now()
);
```

## Semantic Chunking Strategy

1. Extract page text and page numbers.
2. Remove obvious boilerplate.
3. Detect headings:
   - Numbered headings.
   - All-caps section headings.
   - Font-size metadata when available.
   - Table-of-contents patterns.
4. Split by headings and page boundaries.
5. Merge tiny sections into nearby sections.
6. Split oversized sections by paragraphs.
7. Preserve page ranges, headings, token estimates, and text hash.
8. Store full chunk text in S3 if it exceeds comfortable DB row size.

Target chunk size:

- Free: 1,500-2,500 tokens.
- Premium: 2,000-4,000 tokens.

Never send complete extracted PDF text to the LLM.

## Map-Reduce Strategy

Map phase:

- Each chunk worker summarizes one chunk.
- Each summary stores key points and concepts.
- Failed chunks are retried independently.

Reduce phase:

- Merge chunk summaries into section summaries.
- Merge section summaries into document-level understanding.
- Use summaries and extracted concepts to generate cards.

This reduces token usage for large PDFs and improves card quality by using document-level context.

## Concept Extraction

Extract and store:

- Definitions.
- Important concepts.
- Key terms.
- Relationships.
- Processes.
- Formulas.
- Facts.
- Examples.

Concept extraction should happen from chunk summaries first, then from selected high-value source chunks when more detail is needed.

## Flashcard Generation

Generate candidate cards from:

- Chunk summaries.
- Section summaries.
- Extracted concepts.

Card types:

- Definition cards.
- Concept cards.
- Process cards.
- Relationship cards.
- Formula cards.
- Q&A cards.

Generation rules:

- Ask for exact target count per batch.
- Require JSON schema.
- Validate every card.
- Store rejected cards with rejection reason for diagnostics when useful.

## Deduplication and Quality

Deduplicate using:

- Normalized question text.
- Normalized answer overlap.
- Concept overlap.
- Optional embedding similarity for premium/high-volume jobs.

Quality validation:

- Question is clear and educational.
- Answer is factual and not empty.
- Card is not too vague.
- Card is not duplicate.
- Card has sufficient concept grounding.
- Quality score meets threshold.

Keep the highest-quality version in each duplicate group.

## Worker Pseudocode

### API upload start

```python
def start_upload_processing(user, upload):
    job = create_generation_job(user, upload)
    enqueue("validation_queue", {"job_id": job.id})
    return {"upload_id": upload.id, "job_id": job.id, "status": "UPLOADED"}
```

### Validation worker

```python
def validation_worker(message):
    job = load_job(message["job_id"])
    mark_stage(job, "VALIDATING", 5)

    pdf_meta = inspect_pdf(job.upload.file_url)
    update_upload_page_count(job.upload_id, pdf_meta.page_count)

    plan = load_user_plan(job.user_id)
    if plan == "free" and pdf_meta.page_count > 150:
        fail_job(job, "PREMIUM_REQUIRED", premium_required_message(pdf_meta.page_count))
        notify_user_failed(job)
        return

    enqueue("extraction_queue", {"job_id": job.id})
```

### Extraction worker

```python
def extraction_worker(message):
    job = load_job(message["job_id"])
    mark_stage(job, "EXTRACTING", 10)

    pdf = s3_get(job.upload.file_url)
    pages = extract_text_pages(pdf)

    if too_little_text(pages):
        if job.plan == "premium":
            pages = run_ocr(pdf)
        else:
            fail_job(job, "PDF_EXTRACTION_FAILED")
            notify_user_failed(job)
            return

    chunks = semantic_chunk(pages)
    save_generation_chunks(job, chunks)
    enqueue("orchestration_queue", {"job_id": job.id})
```

### Round-robin orchestrator

```python
def orchestrator_worker(message):
    job = load_job(message["job_id"])
    mark_stage(job, "SUMMARIZING", 35)

    chunks = load_pending_chunks(job.id)
    providers = healthy_providers(["openrouter", "gemini", "groq"])

    if not providers:
        fail_job(job, "PROVIDER_UNAVAILABLE")
        return

    for chunk in chunks:
        provider = choose_round_robin_provider(chunk.chunk_index, providers)
        if circuit_is_open(provider):
            provider = choose_alternate_provider(provider, providers)

        assign_chunk_provider(chunk.id, provider)
        delay_ms = calculate_dispatch_delay(provider)
        enqueue_provider_queue(provider, {"chunk_id": chunk.id}, delay_ms=delay_ms)
```

### Provider chunk worker

```python
def provider_chunk_worker(message, provider_name):
    chunk = claim_chunk(message["chunk_id"])
    provider = load_provider(provider_name)

    try:
        throttle(provider)
        summary = provider.summarize(chunk.text)
        concepts = provider.extract_concepts(summary)
        cards = provider.generate_cards(summary, concepts)

        save_chunk_summary(chunk, provider_name, summary)
        save_extracted_concepts(chunk, concepts)
        save_generated_cards(chunk, cards)
        mark_chunk_completed(chunk)
        record_provider_success(provider)

    except ProviderRateLimitError:
        record_provider_failure(provider, "LLM_RATE_LIMIT")
        retry_or_failover_chunk(chunk, provider_name, "LLM_RATE_LIMIT")

    except ProviderTimeoutError:
        record_provider_failure(provider, "LLM_TIMEOUT")
        retry_or_failover_chunk(chunk, provider_name, "LLM_TIMEOUT")

    except JsonInvalidError:
        retry_or_failover_chunk(chunk, provider_name, "JSON_INVALID")

    finally:
        update_job_chunk_progress(chunk.job_id)
        if all_chunks_terminal(chunk.job_id):
            enqueue("reduce_queue", {"job_id": chunk.job_id})
```

### Chunk retry and failover

```python
def retry_or_failover_chunk(chunk, provider_name, error_code):
    if chunk.attempts < 3:
        delay = [2, 5, 10][chunk.attempts] * 1000
        enqueue_provider_queue(provider_name, {"chunk_id": chunk.id}, delay_ms=delay)
        increment_attempt(chunk)
        return

    alternate = choose_alternate_provider(provider_name, ["gemini", "groq"])
    if alternate and provider_is_available(alternate):
        mark_chunk_fallback(chunk, alternate)
        enqueue_provider_queue(alternate, {"chunk_id": chunk.id})
        return

    mark_chunk_failed(chunk, error_code)
```

### Reducer worker

```python
def reducer_worker(message):
    job = load_job(message["job_id"])

    mark_stage(job, "DEDUPLICATING", 85)
    summaries = load_chunk_summaries(job.id)
    concepts = load_concepts(job.id)
    candidates = load_generated_cards(job.id)

    document_summary = reduce_summaries(summaries)
    ranked = rank_cards(candidates, concepts, document_summary)
    unique = deduplicate_cards(ranked)

    mark_stage(job, "VALIDATING_CARDS", 92)
    final_cards = validate_quality(unique, target=job.requested_cards)

    if len(final_cards) < minimum_required(job):
        fail_job(job, "NO_VALID_CARDS")
        notify_user_failed(job)
        return

    deck = create_deck_with_cards(job.user_id, final_cards)
    complete_job(job, deck.id)
    notify_user_success(job, deck.id)
```

## Observability

Sentry tags:

- `feature`
- `action`
- `upload_id`
- `job_id`
- `chunk_id`
- `user_id`
- `provider_name`
- `error_code`
- `stage`

CloudWatch metrics:

- `GenerationJobsStarted`
- `GenerationJobsCompleted`
- `GenerationJobsFailed`
- `ChunksQueued`
- `ChunksCompleted`
- `ChunksFailed`
- `ProviderRequests`
- `ProviderRateLimits`
- `ProviderTimeouts`
- `ProviderFallbacks`
- `ProviderCircuitOpened`
- `PromptTokens`
- `CompletionTokens`
- `EstimatedCostUsd`
- `ReducerNoValidCards`

Structured log example:

```json
{
  "event": "generation.chunk_failed",
  "job_id": "job-id",
  "chunk_id": "chunk-id",
  "provider_name": "groq",
  "error_code": "LLM_RATE_LIMIT",
  "attempt": 2,
  "fallback_count": 1
}
```

Dashboards:

- Jobs by stage.
- Failure rate by provider.
- Rate-limit count by provider.
- Token usage by provider.
- Cost by provider.
- Chunk queue depth.
- DLQ messages.
- Average job completion time.

## Security

- Never expose queue URLs, Lambda URLs, S3 keys, provider names, or stack traces to the frontend.
- Frontend only receives approved API responses.
- Store provider API keys in SSM Parameter Store or Secrets Manager.
- Use Lambda IAM roles for S3/SQS access.
- Filter all tokens, presigned URLs, and auth headers from logs and Sentry.
- Use idempotency keys for deck/card creation and notification logging.
- Keep RLS enabled in Supabase; backend uses service role only server-side.

## Cost Optimization

- Use page-count validation before extraction/LLM.
- Use semantic chunking to reduce duplicate context.
- Summarize chunks before card generation for large PDFs.
- Generate cards from concepts instead of raw text when possible.
- Round-robin across providers to avoid exhausting one quota.
- Stop generation when enough high-quality cards exist.
- Reuse summaries for retry/reducer work.
- Store token usage by job/chunk/provider.
- Free users get lower max pages, lower card count, and lower concurrency.

## Implementation Roadmap

### Phase 1: Stabilize Current Backend

- Add provider abstraction interface.
- Add Gemini provider.
- Add provider rate-limit classification.
- Add `provider_health`.
- Add `AI_RATE_LIMITED`/`LLM_RATE_LIMIT` errors.
- Ensure upload jobs fail fast on quota exhaustion.

### Phase 2: Job and Chunk Tables

- Add `generation_jobs`.
- Add `generation_chunks`.
- Add `processing_events`.
- Store chunk status and progress.
- Update frontend progress to use job/chunk status.

### Phase 3: Provider Queues

- Add `openrouter_generation_queue`.
- Add `gemini_generation_queue`.
- Add `groq_generation_queue`.
- Add provider-specific workers.
- Implement round-robin orchestrator.
- Implement chunk-level retry/failover.

### Phase 4: Map-Reduce Quality Pipeline

- Add `chunk_summaries`.
- Add `extracted_concepts`.
- Add `generated_cards`.
- Add reducer worker.
- Add quality validation and dedupe.

### Phase 5: Premium Large PDF Support

- Add plan-based page limits.
- Add OCR route.
- Add priority queues.
- Add 500+ page premium settings.
- Add admin dashboard and DLQ replay tools.

## Current Practical Priority

The most urgent current production issue is Groq quota exhaustion. The new architecture solves that by distributing chunks across Gemini and Groq, tracking provider health, and failing over only the affected chunks.

Immediate next build step:

1. Add Gemini provider implementation.
2. Add provider abstraction.
3. Add `provider_health` table.
4. Add round-robin routing for chunks.
5. Stop using a single-provider chunk loop for all PDF generation.
