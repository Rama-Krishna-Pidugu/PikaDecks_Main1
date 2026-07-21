import os
import re
from typing import Any

from app.observability import capture_backend_exception, log_structured_event
from app.services.ai_orchestrator import (
    AIProviderRateLimitError,
    choose_alternate_provider,
    generate_deck_title_with_provider,
    get_available_providers,
)


MAX_DECK_TITLE_LENGTH = 60
GENERIC_TITLE_WORDS = {
    "youtube",
    "document",
    "file",
    "upload",
    "uploads",
    "notes",
    "note",
    "final",
    "draft",
    "copy",
    "lecture",
    "deck",
    "study",
}


def clean_source_title(source_title: str | None, *, default: str = "Untitled Topic") -> str:
    title = os.path.basename((source_title or "").strip())
    title = re.sub(r"\.[A-Za-z0-9]{1,8}$", "", title)
    title = re.sub(r"https?://\S+", " ", title, flags=re.IGNORECASE)
    title = re.sub(r"[_\-]+", " ", title)
    title = re.sub(r"\b[a-zA-Z0-9]{16,}\b", " ", title)
    title = re.sub(r"\b(v|ver|version)\s*\d+\b", " ", title, flags=re.IGNORECASE)
    title = re.sub(r"\b\d{4}[-_/]\d{1,2}[-_/]\d{1,2}\b", " ", title)
    title = re.sub(r"\b\d{1,2}[-_/]\d{1,2}[-_/]\d{2,4}\b", " ", title)
    title = re.sub(r"[^A-Za-z0-9 &:/()+']", " ", title)
    title = re.sub(r"\s+", " ", title).strip()
    if not title:
        return default

    words = [
        word
        for word in title.split()
        if word.lower() not in {"pdf", "doc", "docx", "ppt", "pptx", "mp4", "mov"}
    ]
    title = " ".join(words).strip()
    if not title:
        return default

    return sanitize_deck_title(title.title(), fallback=default)


def sanitize_deck_title(title: str | None, *, fallback: str = "Untitled Topic") -> str:
    cleaned = re.sub(r"https?://\S+", " ", (title or ""), flags=re.IGNORECASE)
    cleaned = re.sub(r"\.[A-Za-z0-9]{1,8}\b", " ", cleaned)
    cleaned = re.sub(r"[_]+", " ", cleaned)
    cleaned = re.sub(r"\b[a-zA-Z0-9_-]{16,}\b", " ", cleaned)
    cleaned = re.sub(r"\b\d{4}[-_/]\d{1,2}[-_/]\d{1,2}\b", " ", cleaned)
    cleaned = re.sub(r"\b\d{1,2}:\d{2}(:\d{2})?\b", " ", cleaned)
    cleaned = re.sub(r"[^A-Za-z0-9 &:/()+']", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -_:")
    if not cleaned:
        cleaned = fallback

    words = cleaned.split()
    while words and words[0].lower() in GENERIC_TITLE_WORDS:
        words.pop(0)
    while words and words[-1].lower() in GENERIC_TITLE_WORDS:
        words.pop()
    cleaned = " ".join(words).strip() or fallback

    if len(cleaned) > MAX_DECK_TITLE_LENGTH:
        trimmed = cleaned[:MAX_DECK_TITLE_LENGTH].rsplit(" ", 1)[0].strip()
        cleaned = trimmed or cleaned[:MAX_DECK_TITLE_LENGTH].strip()

    return cleaned or fallback


def _content_excerpt(
    *,
    content: str | None = None,
    headings: list[str] | None = None,
    concepts: list[Any] | None = None,
    summaries: list[Any] | None = None,
    max_chars: int = 10000,
) -> str:
    parts: list[str] = []
    if headings:
        heading_text = "\n".join(str(heading).strip() for heading in headings[:20] if str(heading).strip())
        if heading_text:
            parts.append(f"Headings:\n{heading_text}")
    if concepts:
        concept_lines = []
        for concept in concepts[:40]:
            if isinstance(concept, dict):
                term = concept.get("term")
                definition = concept.get("definition")
                if term:
                    concept_lines.append(f"- {term}: {definition or ''}")
            elif str(concept).strip():
                concept_lines.append(f"- {concept}")
        if concept_lines:
            parts.append(f"Key concepts:\n{chr(10).join(concept_lines)}")
    if summaries:
        summary_lines = []
        for summary in summaries[:8]:
            if isinstance(summary, dict):
                value = summary.get("summary") or " ".join(summary.get("key_points") or [])
            else:
                value = str(summary)
            if value:
                summary_lines.append(str(value).strip())
        if summary_lines:
            parts.append(f"Summaries:\n{chr(10).join(summary_lines)}")
    if content:
        parts.append(f"Content:\n{content.strip()}")
    excerpt = "\n\n".join(part for part in parts if part).strip()
    return excerpt[:max_chars]


def generate_study_deck_title(
    *,
    source: str,
    content: str | None = None,
    source_title: str | None = None,
    headings: list[str] | None = None,
    concepts: list[Any] | None = None,
    summaries: list[Any] | None = None,
    fallback_title: str | None = None,
) -> str:
    fallback = clean_source_title(fallback_title or source_title, default="Untitled Topic")
    excerpt = _content_excerpt(content=content, headings=headings, concepts=concepts, summaries=summaries)
    if len(excerpt) < 80:
        return fallback

    providers = get_available_providers()
    if not providers:
        return fallback

    provider_name = providers[0]
    try:
        result = generate_deck_title_with_provider(excerpt, provider_name, source_hint=source_title or source)
    except AIProviderRateLimitError:
        alternate = choose_alternate_provider(provider_name, providers)
        if not alternate:
            return fallback
        try:
            result = generate_deck_title_with_provider(excerpt, alternate, source_hint=source_title or source)
        except Exception as exc:
            capture_backend_exception(
                exc,
                feature="deck_titles",
                action="alternate_title_generation_failed",
                tags={"source": source, "provider": alternate},
            )
            return fallback
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="deck_titles",
            action="title_generation_failed",
            tags={"source": source, "provider": provider_name},
        )
        return fallback

    title = sanitize_deck_title(result.title, fallback=fallback)
    log_structured_event(
        "deck_title.generated",
        source=source,
        provider=result.provider_name,
        title=title,
        candidates=result.candidates,
        fallback_used=title == fallback,
    )
    return title
