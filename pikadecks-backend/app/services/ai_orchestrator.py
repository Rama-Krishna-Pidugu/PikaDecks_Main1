import json
import logging
import os
import random
import time
from dataclasses import dataclass
from typing import Any

import requests
from groq import Groq

from app.database import supabase
from app.observability import capture_backend_exception, log_cloudwatch_metric, log_structured_event, trace_span


logger = logging.getLogger("pikadecks.ai_orchestrator")


class AIProviderError(RuntimeError):
    pass


class AIProviderRateLimitError(AIProviderError):
    pass


class AIProviderUnavailableError(AIProviderError):
    pass


class AIProviderInvalidJsonError(AIProviderError):
    pass


@dataclass
class AIProviderResult:
    provider_name: str
    flashcards: list[dict[str, Any]]
    latency_ms: int
    prompt_tokens: int = 0
    completion_tokens: int = 0
    summary: str = ""
    key_points: list[str] | None = None
    concepts: list[dict[str, Any]] | None = None


@dataclass
class AISummaryResult:
    provider_name: str
    summary: str
    key_points: list[str]
    concepts: list[dict[str, Any]]
    latency_ms: int
    prompt_tokens: int = 0
    completion_tokens: int = 0


@dataclass
class AITitleResult:
    provider_name: str
    title: str
    candidates: list[str]
    latency_ms: int
    prompt_tokens: int = 0
    completion_tokens: int = 0


_groq_client = None
ALLOWED_AI_PROVIDERS = {"groq", "gemini"}


def _clean_api_key(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip().strip('"').strip("'")
    if cleaned.lower().startswith("bearer "):
        cleaned = cleaned[7:].strip()
    return cleaned or None


def _groq_api_key() -> str | None:
    return _clean_api_key(os.getenv("GROQ_API_KEY"))


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_available_providers() -> list[str]:
    providers: list[str] = []
    groq_configured = bool(_groq_api_key())
    gemini_configured = bool(os.getenv("GEMINI_API_KEY"))
    if not groq_configured:
        logger.warning(
            "Groq API key is not configured; AI generation requires GROQ_API_KEY"
        )
        return providers
    # Restore 'providers.append("groq")' once Groq SQS resources are re-enabled.
    providers.append("groq")
    if gemini_configured:
        providers.append("gemini")
    logger.info("Available AI providers in priority order: %s", providers)
    return providers


def choose_round_robin_provider(chunk_index: int, providers: list[str] | None = None) -> str:
    available = providers or get_available_providers()
    if not available:
        raise AIProviderUnavailableError("No AI providers are configured")
    return available[chunk_index % len(available)]


def choose_alternate_provider(provider_name: str, providers: list[str] | None = None) -> str | None:
    available = [provider for provider in (providers or get_available_providers()) if provider != provider_name]
    return available[0] if available else None


def build_flashcard_prompt(text: str, max_cards: int) -> str:
    return f"""
You are an expert educator.

Read the following educational content and generate {max_cards} high-quality, highly engaging flashcards designed to optimize long-term retention.
If the content is limited, generate as many useful flashcards as possible, but do not invent facts.

Rules for High-Quality Cards:
- Do NOT generate simple, dry definition or passive recall cards (e.g., "What is X?"). Instead, apply active learning principles.
- Use only facts present in the content.
- Ensure a diverse mix of the following higher-order card types:
  1. Scenario-based: Present a realistic practical scenario or problem and ask for the correct approach, command, or outcome (e.g., "A developer needs to configure X to achieve Y. What setting should they use?").
  2. Compare/contrast: Ask about key differences, similarities, advantages, or trade-offs between two concepts/tools/options.
  3. Code-completion: Show a short code snippet with a placeholder (e.g., `???`) for a critical API, parameter, hook, or syntax element, and ask what should replace it.
  4. Troubleshooting: Describe a common bug, error message, or unexpected behavior and ask for the root cause or the fix.
  5. "Why" questions: Ask about the architectural reasoning, benefits, or underlying mechanics of a design decision.
  6. Application-based: Ask how a concept is applied in a practical project structure, config file, or setup.
- Avoid vague questions.
- Avoid duplicate questions.
- Keep answers concise but complete.
- Include a clear, helpful explanation for every card to reinforce learning.
- **LaTeX Math Rendering**: If there are mathematical formulas, expressions, variables, or equations, use standard LaTeX syntax. Use `$...$` for inline math (e.g., $E=mc^2$) and `$$...$$` for block math equations.
- **Image References**: Check if the content has references of the format `[Image Reference: <key>]`. If a flashcard is directly relevant to a concept visualized in an image reference (e.g. diagrams, flowcharts, network models, structures, charts), include the exact key in the `"image_key"` key (if it visualizes the question) or `"notes_image_key"` key (if it visualizes the explanation/answer/notes). Otherwise, set these keys to null.

You MUST return a JSON object with a single key "flashcards" containing a list of flashcards.
Each flashcard must have "question", "answer", "explanation", "card_type", "image_key", and "notes_image_key" keys.

Format:
{{
  "flashcards": [
    {{
      "question": "question text",
      "answer": "answer text",
      "explanation": "clear, educational explanation explaining the concepts, context, or code",
      "card_type": "scenario|compare_contrast|code_completion|troubleshooting|why|application|definition|concept|process|relationship|formula|qa",
      "image_key": "optional image key from image references or null",
      "notes_image_key": "optional image key from image references or null"
    }}
  ]
}}

Content:
{text}
"""


def build_learning_artifacts_prompt(text: str, max_cards: int) -> str:
    return f"""
You are an expert educator building a flashcard deck from one chunk of a larger PDF.

Analyze only the content below. Do not invent facts.

Return one JSON object with:
- "summary": 2-4 sentence chunk summary.
- "key_points": 3-8 important points.
- "concepts": important definitions, terms, processes, formulas, relationships, and examples.
- "flashcards": up to {max_cards} high-quality flashcards.

Each concept must have:
- "concept_type": "definition|concept|process|relationship|formula|fact|example"
- "term"
- "definition"
- "relationships" as a list
- "examples" as a list
- "importance_score" from 0 to 1

Each flashcard must have:
- "question"
- "answer"
- "explanation"
- "card_type": "scenario|compare_contrast|code_completion|troubleshooting|why|application|definition|concept|process|relationship|formula|qa"
- "image_key"
- "notes_image_key"

Rules for High-Quality Flashcards:
- Do NOT generate simple, dry definition or passive recall cards (e.g., "What is X?"). Instead, apply active learning principles.
- Ensure a diverse mix of the following higher-order card types:
  1. Scenario-based: Present a realistic practical scenario or problem and ask for the correct approach, command, or outcome.
  2. Compare/contrast: Ask about key differences, similarities, advantages, or trade-offs between two concepts/tools/options.
  3. Code-completion: Show a short code snippet with a placeholder (e.g., `???`) for a critical API, parameter, hook, or syntax element, and ask what should replace it.
  4. Troubleshooting: Describe a common bug, error message, or unexpected behavior and ask for the root cause or the fix.
  5. "Why" questions: Ask about the architectural reasoning, benefits, or underlying mechanics of a design decision.
  6. Application-based: Ask how a concept is applied in a practical project structure, config file, or setup.
- Avoid vague or duplicate flashcards. Prefer testable, educational questions.
- Keep answers concise but complete.
- Include a clear, helpful explanation for every card to reinforce learning.
- **LaTeX Math Rendering**: If there are mathematical formulas, expressions, variables, or equations, use standard LaTeX syntax. Use `$...$` for inline math (e.g., $E=mc^2$) and `$$...$$` for block math equations.
- **Image References**: Check if the content has references of the format `[Image Reference: <key>]`. If a flashcard is directly relevant to a concept visualized in an image reference (e.g. diagrams, flowcharts, network models, structures, charts), include the exact key in the `"image_key"` key (if it visualizes the question) or `"notes_image_key"` key (if it visualizes the explanation/answer/notes). Otherwise, set these keys to null.

Content:
{text}
"""


def build_summary_prompt(text: str) -> str:
    return f"""
You are an expert educator preparing source material for a flashcard deck.

Analyze only the content below. Do not invent facts.

Return one JSON object with:
- "summary": a concise but information-dense summary of the content.
- "key_points": 5-12 important, testable points.
- "concepts": important definitions, terms, processes, formulas, relationships, and examples.

Each concept must have:
- "concept_type": "definition|concept|process|relationship|formula|fact|example"
- "term"
- "definition"
- "relationships" as a list
- "examples" as a list
- "importance_score" from 0 to 1

Content:
{text}
"""


def build_deck_title_prompt(text: str, source_hint: str | None = None) -> str:
    return f"""
You are naming a study flashcard deck.

Analyze the actual study content below. Identify the primary topic a learner is studying.
Generate exactly 3 concise candidate deck titles, then choose the best final title.

Rules:
- 3 to 8 words.
- Maximum 60 characters.
- Professional, human-readable, and descriptive.
- Summarize the studied subject, not the source.
- Do not use file extensions, URLs, random IDs, timestamps, underscores, or version labels.
- Do not use generic words like youtube, document, file, upload, notes, final, unit, chapter, lecture, deck, or study unless essential to the actual topic.
- Return JSON only.

Format:
{{
  "candidates": ["Title One", "Title Two", "Title Three"],
  "final_title": "Best Title"
}}

Source hint, only for context if useful:
{source_hint or "None"}

Study content:
{text}
"""


def _parse_learning_artifacts_json(raw: str) -> dict[str, Any]:
    raw = (raw or "").strip()
    if not raw:
        raise AIProviderInvalidJsonError("AI provider returned an empty response")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        import re

        object_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not object_match:
            raise
        data = json.loads(object_match.group(0))

    if not isinstance(data, dict):
        raise AIProviderInvalidJsonError("AI response was not a JSON object")

    flashcards = data.get("flashcards") or []
    concepts = data.get("concepts") or []
    key_points = data.get("key_points") or []
    return {
        "summary": str(data.get("summary") or "").strip(),
        "key_points": [str(point).strip() for point in key_points if str(point).strip()][:8] if isinstance(key_points, list) else [],
        "concepts": [concept for concept in concepts if isinstance(concept, dict)][:12] if isinstance(concepts, list) else [],
        "flashcards": [card for card in flashcards if isinstance(card, dict)] if isinstance(flashcards, list) else [],
    }


def _parse_flashcard_json(raw: str) -> list[dict[str, Any]]:
    raw = (raw or "").strip()
    if not raw:
        raise AIProviderInvalidJsonError("AI provider returned an empty response")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        import re

        object_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not object_match:
            raise
        data = json.loads(object_match.group(0))

    if not isinstance(data, dict):
        raise AIProviderInvalidJsonError("AI response was not a JSON object")

    flashcards = data.get("flashcards", [])
    if not isinstance(flashcards, list):
        raise AIProviderInvalidJsonError("AI response did not contain a flashcards list")

    return [card for card in flashcards if isinstance(card, dict)]


def _parse_title_json(raw: str) -> tuple[str, list[str]]:
    raw = (raw or "").strip()
    if not raw:
        raise AIProviderInvalidJsonError("AI provider returned an empty title response")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        import re

        object_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not object_match:
            raise
        data = json.loads(object_match.group(0))

    if not isinstance(data, dict):
        raise AIProviderInvalidJsonError("AI title response was not a JSON object")

    candidates = data.get("candidates") or []
    cleaned_candidates = [str(candidate).strip() for candidate in candidates if str(candidate).strip()]
    final_title = str(data.get("final_title") or (cleaned_candidates[0] if cleaned_candidates else "")).strip()
    if not final_title:
        raise AIProviderInvalidJsonError("AI title response did not contain a title")
    return final_title, cleaned_candidates[:3]


def _parse_provider_artifacts(raw: str, *, artifacts: bool) -> dict[str, Any]:
    if artifacts:
        return _parse_learning_artifacts_json(raw)
    return {
        "summary": "",
        "key_points": [],
        "concepts": [],
        "flashcards": _parse_flashcard_json(raw),
    }


def _is_rate_limit_error(error: Exception) -> bool:
    message = str(error).lower()
    return (
        "429" in message
        or "rate limit" in message
        or "quota" in message
        or "too many requests" in message
        or "resource_exhausted" in message
    )


def _is_timeout_or_5xx(error: Exception) -> bool:
    message = str(error).lower()
    return "timeout" in message or "timed out" in message or " 5" in message or "internal" in message


def _get_groq_client():
    global _groq_client
    if _groq_client is None:
        api_key = _groq_api_key()
        if not api_key:
            raise AIProviderUnavailableError("Groq API key is not configured")
        _groq_client = Groq(api_key=api_key)
    return _groq_client


def _request_limit_per_minute() -> int:
    return min(30, max(1, _int_env("AI_GLOBAL_REQUESTS_PER_MINUTE", 10)))


def _token_limit_per_five_minutes() -> int:
    return max(1, _int_env("AI_GLOBAL_TOKENS_PER_5_MINUTES", 30000))


def _max_output_tokens() -> int:
    return max(256, _int_env("AI_MAX_OUTPUT_TOKENS", 4096))


def _max_output_tokens_for_provider(provider_name: str) -> int:
    if provider_name == "groq":
        return max(256, min(_max_output_tokens(), _int_env("GROQ_MAX_OUTPUT_TOKENS", 4096)))
    return _max_output_tokens()


def _max_request_tokens_for_provider(provider_name: str) -> int | None:
    if provider_name == "groq":
        return max(1024, _int_env("GROQ_MAX_REQUEST_TOKENS", 5500))
    configured = os.getenv(f"{provider_name.upper()}_MAX_REQUEST_TOKENS")
    if configured:
        return max(1024, _int_env(f"{provider_name.upper()}_MAX_REQUEST_TOKENS", 0))
    return None


def _estimated_request_tokens(prompt: str, *, output_tokens: int | None = None) -> int:
    return max(1, len(prompt or "") // 4) + (output_tokens if output_tokens is not None else _max_output_tokens())


def _fit_text_to_provider_budget(
    text: str,
    provider_name: str,
    prompt_builder,
    *,
    min_chars: int = 1200,
) -> tuple[str, str]:
    prompt = prompt_builder(text)
    max_request_tokens = _max_request_tokens_for_provider(provider_name)
    output_tokens = _max_output_tokens_for_provider(provider_name)
    if not max_request_tokens or _estimated_request_tokens(prompt, output_tokens=output_tokens) <= max_request_tokens:
        return text, prompt

    available_prompt_tokens = max(256, max_request_tokens - output_tokens)
    target_chars = max(min_chars, available_prompt_tokens * 4)
    trimmed_text = (text or "")[:target_chars].rsplit("\n", 1)[0].strip() or (text or "")[:target_chars].strip()
    prompt = prompt_builder(trimmed_text)

    while len(trimmed_text) > min_chars and _estimated_request_tokens(prompt, output_tokens=output_tokens) > max_request_tokens:
        target_chars = max(min_chars, int(len(trimmed_text) * 0.8))
        trimmed_text = trimmed_text[:target_chars].rsplit("\n", 1)[0].strip() or trimmed_text[:target_chars].strip()
        prompt = prompt_builder(trimmed_text)

    if len(trimmed_text) < len(text or ""):
        logger.warning(
            "Trimmed AI prompt for provider=%s from %s to %s chars to fit request token budget=%s",
            provider_name,
            len(text or ""),
            len(trimmed_text),
            max_request_tokens,
        )
    return trimmed_text, prompt


def _reserve_global_ai_capacity(provider_name: str, prompt: str) -> None:
    if not _bool_env("AI_GLOBAL_RATE_LIMIT_ENABLED", True):
        return
    if provider_name not in ALLOWED_AI_PROVIDERS:
        raise AIProviderUnavailableError(f"{provider_name} is disabled; only Groq and Gemini are enabled")

    request_tokens = _estimated_request_tokens(
        prompt,
        output_tokens=min(1500, _max_output_tokens_for_provider(provider_name)),
    )
    response = supabase.rpc(
        "consume_ai_rate_limit",
        {
            "p_provider_name": provider_name,
            "p_request_tokens": request_tokens,
            "p_request_limit": _request_limit_per_minute(),
            "p_token_limit": _token_limit_per_five_minutes(),
        },
    ).execute()
    result = response.data or {}
    if isinstance(result, list):
        result = result[0] if result else {}
    if not result.get("allowed"):
        reason = result.get("reason") or "global_limit"
        retry_after = result.get("retry_after_seconds")
        detail = f"Global AI rate limit reached: {reason}"
        if retry_after:
            detail = f"{detail}; retry after {retry_after}s"
        raise AIProviderRateLimitError(detail)


def _generate_with_groq(prompt: str, max_cards: int, *, artifacts: bool = False) -> tuple[dict[str, Any], int, int]:
    model_name = os.getenv("GROQ_MODEL") or "llama-3.3-70b-versatile"
    completion = _get_groq_client().chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=_max_output_tokens_for_provider("groq"),
    )
    raw = (completion.choices[0].message.content or "").strip()
    usage = getattr(completion, "usage", None)
    prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    return _parse_provider_artifacts(raw, artifacts=artifacts), prompt_tokens, completion_tokens


def _generate_with_gemini(prompt: str, max_cards: int, *, artifacts: bool = False) -> tuple[dict[str, Any], int, int]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise AIProviderUnavailableError("Gemini API key is not configured")

    model_name = os.getenv("GEMINI_MODEL") or "gemini-3.1-pro-preview"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
    response = requests.post(
        url,
        params={"key": api_key},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2,
                "maxOutputTokens": _max_output_tokens(),
            },
        },
        timeout=45,
    )

    if response.status_code == 429:
        raise AIProviderRateLimitError(f"Gemini rate limited: {response.text[:300]}")
    if response.status_code >= 500:
        raise AIProviderUnavailableError(f"Gemini unavailable: {response.status_code} {response.text[:300]}")
    if response.status_code >= 400:
        raise AIProviderError(f"Gemini request failed: {response.status_code} {response.text[:300]}")

    payload = response.json()
    candidates = payload.get("candidates") or []
    parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
    raw = "".join(part.get("text", "") for part in parts)
    usage = payload.get("usageMetadata") or {}
    return (
        _parse_provider_artifacts(raw, artifacts=artifacts),
        int(usage.get("promptTokenCount") or 0),
        int(usage.get("candidatesTokenCount") or 0),
    )


def _generate_title_with_groq(prompt: str) -> tuple[str, list[str], int, int]:
    model_name = os.getenv("GROQ_MODEL") or "llama-3.3-70b-versatile"
    completion = _get_groq_client().chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=min(512, _max_output_tokens_for_provider("groq")),
    )
    raw = (completion.choices[0].message.content or "").strip()
    usage = getattr(completion, "usage", None)
    prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    title, candidates = _parse_title_json(raw)
    return title, candidates, prompt_tokens, completion_tokens


def _generate_title_with_gemini(prompt: str) -> tuple[str, list[str], int, int]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise AIProviderUnavailableError("Gemini API key is not configured")

    model_name = os.getenv("GEMINI_MODEL") or "gemini-3.1-pro-preview"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
    response = requests.post(
        url,
        params={"key": api_key},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2,
                "maxOutputTokens": 512,
            },
        },
        timeout=30,
    )

    if response.status_code == 429:
        raise AIProviderRateLimitError(f"Gemini rate limited: {response.text[:300]}")
    if response.status_code >= 500:
        raise AIProviderUnavailableError(f"Gemini unavailable: {response.status_code} {response.text[:300]}")
    if response.status_code >= 400:
        raise AIProviderError(f"Gemini title request failed: {response.status_code} {response.text[:300]}")

    payload = response.json()
    candidates_payload = payload.get("candidates") or []
    parts = candidates_payload[0].get("content", {}).get("parts", []) if candidates_payload else []
    raw = "".join(part.get("text", "") for part in parts)
    usage = payload.get("usageMetadata") or {}
    title, candidates = _parse_title_json(raw)
    return title, candidates, int(usage.get("promptTokenCount") or 0), int(usage.get("candidatesTokenCount") or 0)


def generate_deck_title_with_provider(
    text: str,
    provider_name: str,
    *,
    source_hint: str | None = None,
    max_retries: int = 2,
) -> AITitleResult:
    if provider_name not in ALLOWED_AI_PROVIDERS:
        raise AIProviderUnavailableError(f"{provider_name} is disabled; only Groq and Gemini are enabled")
    text, prompt = _fit_text_to_provider_budget(
        text,
        provider_name,
        lambda prompt_text: build_deck_title_prompt(prompt_text, source_hint),
        min_chars=1200,
    )
    delays = [1, 3]

    for attempt in range(max_retries + 1):
        started_at = time.perf_counter()
        try:
            _reserve_global_ai_capacity(provider_name, prompt)
            with trace_span(
                op="ai.title",
                description=f"generate_title_with_{provider_name}",
                tags={"provider": provider_name, "attempt": attempt + 1, "operation_type": "title_generation"}
            ) as span:
                if provider_name == "gemini":
                    title, candidates, prompt_tokens, completion_tokens = _generate_title_with_gemini(prompt)
                elif provider_name == "groq":
                    title, candidates, prompt_tokens, completion_tokens = _generate_title_with_groq(prompt)
                else:
                    raise AIProviderUnavailableError(f"Unknown AI provider: {provider_name}")
                
                span.set_data("prompt_tokens", prompt_tokens)
                span.set_data("completion_tokens", completion_tokens)

            return AITitleResult(
                provider_name=provider_name,
                title=title,
                candidates=candidates,
                latency_ms=round((time.perf_counter() - started_at) * 1000),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
        except Exception as error:
            if _is_rate_limit_error(error):
                raise AIProviderRateLimitError(f"{provider_name} rate limited") from error
            should_retry = isinstance(error, AIProviderInvalidJsonError) or _is_timeout_or_5xx(error)
            if should_retry and attempt < max_retries:
                time.sleep(delays[min(attempt, len(delays) - 1)] + random.uniform(0.1, 0.4))
                continue
            capture_backend_exception(
                error,
                feature="ai_generation",
                action="provider_title_generation_failed",
                tags={"provider": provider_name, "attempt": attempt + 1},
                extra={"input_length": len(text or ""), "source_hint": source_hint},
            )
            raise AIProviderError(f"{provider_name} title generation failed") from error


def generate_flashcards_with_provider(
    text: str,
    max_cards: int,
    provider_name: str,
    *,
    max_retries: int = 3,
    include_artifacts: bool = False,
) -> AIProviderResult:
    if provider_name not in ALLOWED_AI_PROVIDERS:
        raise AIProviderUnavailableError(f"{provider_name} is disabled; only Groq and Gemini are enabled")
    prompt_builder = (
        lambda prompt_text: build_learning_artifacts_prompt(prompt_text, max_cards)
        if include_artifacts
        else build_flashcard_prompt(prompt_text, max_cards)
    )
    text, prompt = _fit_text_to_provider_budget(text, provider_name, prompt_builder)
    delays = [2, 5, 10]

    for attempt in range(max_retries + 1):
        started_at = time.perf_counter()
        try:
            _reserve_global_ai_capacity(provider_name, prompt)
            with trace_span(
                op="ai.flashcards",
                description=f"generate_flashcards_with_{provider_name}",
                tags={"provider": provider_name, "attempt": attempt + 1, "operation_type": "flashcard_generation"},
                data={"max_cards": max_cards}
            ) as span:
                if provider_name == "gemini":
                    logger.info("Generation calling provider=%s call_type=cards", provider_name)
                    artifact_payload, prompt_tokens, completion_tokens = _generate_with_gemini(
                        prompt,
                        max_cards,
                        artifacts=include_artifacts,
                    )
                elif provider_name == "groq":
                    logger.info("Generation calling provider=%s call_type=cards", provider_name)
                    artifact_payload, prompt_tokens, completion_tokens = _generate_with_groq(
                        prompt,
                        max_cards,
                        artifacts=include_artifacts,
                    )
                else:
                    raise AIProviderUnavailableError(f"Unknown AI provider: {provider_name}")
                
                span.set_data("prompt_tokens", prompt_tokens)
                span.set_data("completion_tokens", completion_tokens)
                span.set_data("flashcards_count", len(artifact_payload.get("flashcards", [])))

            return AIProviderResult(
                provider_name=provider_name,
                flashcards=artifact_payload["flashcards"],
                latency_ms=round((time.perf_counter() - started_at) * 1000),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                summary=artifact_payload.get("summary") or "",
                key_points=artifact_payload.get("key_points") or [],
                concepts=artifact_payload.get("concepts") or [],
            )
        except Exception as error:
            log_cloudwatch_metric(
                "PikaDecks/AIProvider",
                {"ProviderFailures": 1},
                {"Provider": provider_name},
                event="provider.call_failed",
                call_type="cards",
                attempt=attempt + 1,
                max_retries=max_retries,
                error_type=error.__class__.__name__,
            )
            if _is_rate_limit_error(error):
                raise AIProviderRateLimitError(f"{provider_name} rate limited") from error

            should_retry = isinstance(error, AIProviderInvalidJsonError) or _is_timeout_or_5xx(error)
            if should_retry and attempt < max_retries:
                sleep_time = delays[min(attempt, len(delays) - 1)] + random.uniform(0.1, 0.6)
                time.sleep(sleep_time)
                continue

            capture_backend_exception(
                error,
                feature="ai_generation",
                action="provider_generation_failed",
                tags={
                    "provider": provider_name,
                    "attempt": attempt + 1,
                    "component": "ai_orchestrator",
                },
                extra={
                    "max_cards": max_cards,
                    "input_length": len(text or ""),
                },
            )
            raise AIProviderError(f"{provider_name} generation failed") from error


def generate_summary_with_provider(
    text: str,
    provider_name: str,
    *,
    max_retries: int = 3,
) -> AISummaryResult:
    if provider_name not in ALLOWED_AI_PROVIDERS:
        raise AIProviderUnavailableError(f"{provider_name} is disabled; only Groq and Gemini are enabled")
    text, prompt = _fit_text_to_provider_budget(text, provider_name, build_summary_prompt)
    delays = [2, 5, 10]

    for attempt in range(max_retries + 1):
        started_at = time.perf_counter()
        try:
            _reserve_global_ai_capacity(provider_name, prompt)
            logger.info("Generation calling provider=%s call_type=summary", provider_name)
            with trace_span(
                op="ai.summary",
                description=f"generate_summary_with_{provider_name}",
                tags={"provider": provider_name, "attempt": attempt + 1, "operation_type": "summary_generation"}
            ) as span:
                if provider_name == "gemini":
                    artifact_payload, prompt_tokens, completion_tokens = _generate_with_gemini(
                        prompt,
                        0,
                        artifacts=True,
                    )
                elif provider_name == "groq":
                    artifact_payload, prompt_tokens, completion_tokens = _generate_with_groq(
                        prompt,
                        0,
                        artifacts=True,
                    )
                else:
                    raise AIProviderUnavailableError(f"Unknown AI provider: {provider_name}")
                
                span.set_data("prompt_tokens", prompt_tokens)
                span.set_data("completion_tokens", completion_tokens)

            return AISummaryResult(
                provider_name=provider_name,
                summary=artifact_payload.get("summary") or "",
                key_points=artifact_payload.get("key_points") or [],
                concepts=artifact_payload.get("concepts") or [],
                latency_ms=round((time.perf_counter() - started_at) * 1000),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
        except Exception as error:
            log_cloudwatch_metric(
                "PikaDecks/AIProvider",
                {"ProviderFailures": 1},
                {"Provider": provider_name},
                event="provider.call_failed",
                call_type="summary",
                attempt=attempt + 1,
                max_retries=max_retries,
                error_type=error.__class__.__name__,
            )
            if _is_rate_limit_error(error):
                raise AIProviderRateLimitError(f"{provider_name} rate limited") from error

            should_retry = isinstance(error, AIProviderInvalidJsonError) or _is_timeout_or_5xx(error)
            if should_retry and attempt < max_retries:
                sleep_time = delays[min(attempt, len(delays) - 1)] + random.uniform(0.1, 0.6)
                time.sleep(sleep_time)
                continue

            capture_backend_exception(
                error,
                feature="ai_generation",
                action="provider_summary_failed",
                tags={
                    "provider": provider_name,
                    "attempt": attempt + 1,
                    "component": "ai_orchestrator",
                },
                extra={
                    "input_length": len(text or ""),
                },
            )
            raise AIProviderError(f"{provider_name} summary failed") from error
