import os
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

import requests


YOUTUBE_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
RAPIDAPI_TRANSCRIPT_HOST = "youtube-transcriptor.p.rapidapi.com"


class YouTubeTranscriptError(RuntimeError):
    error_code = "TRANSCRIPT_UNAVAILABLE"


class InvalidYouTubeUrlError(YouTubeTranscriptError):
    error_code = "INVALID_YOUTUBE_URL"


class YouTubeTranscriptDisabledError(YouTubeTranscriptError):
    error_code = "TRANSCRIPT_DISABLED"


class YouTubeVideoUnavailableError(YouTubeTranscriptError):
    error_code = "VIDEO_UNAVAILABLE"


class YouTubeNoTranscriptFoundError(YouTubeTranscriptError):
    error_code = "TRANSCRIPT_UNAVAILABLE"


class YouTubeTranscriptProviderNotConfiguredError(YouTubeTranscriptError):
    error_code = "TRANSCRIPT_UNAVAILABLE"


class EmptyYouTubeTranscriptError(YouTubeTranscriptError):
    error_code = "EMPTY_TRANSCRIPT"


@dataclass
class TranscriptResult:
    video_id: str
    language: str
    transcript: str
    transcript_length: int
    token_estimate: int


def get_video_id(url_or_id: str) -> str | None:
    value = (url_or_id or "").strip()
    if YOUTUBE_VIDEO_ID_RE.fullmatch(value):
        return value

    parsed = urlparse(value)
    hostname = (parsed.hostname or "").lower()

    if hostname == "youtu.be":
        video_id = parsed.path.strip("/").split("/", 1)[0]
        return video_id if YOUTUBE_VIDEO_ID_RE.fullmatch(video_id) else None

    if hostname in {"www.youtube.com", "youtube.com", "m.youtube.com"}:
        video_id = parse_qs(parsed.query).get("v", [None])[0]
        if video_id and YOUTUBE_VIDEO_ID_RE.fullmatch(video_id):
            return video_id
        if parsed.path.startswith("/embed/"):
            video_id = parsed.path.split("/embed/", 1)[1].split("/", 1)[0].split("?", 1)[0]
            return video_id if YOUTUBE_VIDEO_ID_RE.fullmatch(video_id) else None
        if parsed.path.startswith("/shorts/"):
            video_id = parsed.path.split("/shorts/", 1)[1].split("/", 1)[0].split("?", 1)[0]
            return video_id if YOUTUBE_VIDEO_ID_RE.fullmatch(video_id) else None

    return None


def normalize_youtube_url(url_or_id: str) -> str | None:
    video_id = get_video_id(url_or_id)
    if not video_id:
        return None
    return f"https://youtu.be/{video_id}"


def normalize_transcript(text: str) -> str:
    text = (text or "").replace("\x00", "")
    text = re.sub(r"\[(music|applause|laughter|inaudible|silence|foreign language)\]", " ", text, flags=re.I)
    text = re.sub(r"\((music|applause|laughter|inaudible|silence|foreign language)\)", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def _transcript_from_snippets(snippets) -> str:
    if not isinstance(snippets, list):
        return ""
    parts: list[str] = []
    for snippet in snippets:
        if isinstance(snippet, dict):
            text = snippet.get("text") or snippet.get("subtitle") or snippet.get("content")
        else:
            text = getattr(snippet, "text", "")
        if text:
            parts.append(str(text))
    return normalize_transcript(" ".join(parts))


def _extract_rapidapi_transcript(payload, preferred_languages: list[str]) -> tuple[str, str]:
    candidates = payload if isinstance(payload, list) else [payload]
    fallback: tuple[str, str] | None = None

    for item in candidates:
        if isinstance(item, str):
            text = normalize_transcript(item)
            if text and not fallback:
                fallback = (text, preferred_languages[0])
            continue
        if not isinstance(item, dict):
            continue

        language = str(
            item.get("language")
            or item.get("lang")
            or item.get("languageCode")
            or item.get("language_code")
            or preferred_languages[0]
        )
        text = normalize_transcript(
            item.get("transcriptionAsText")
            or item.get("transcript")
            or item.get("text")
            or ""
        )
        if not text:
            text = _transcript_from_snippets(
                item.get("transcription")
                or item.get("transcripts")
                or item.get("subtitles")
                or item.get("captions")
            )
        if not text:
            continue
        if language in preferred_languages:
            return text, language
        if not fallback:
            fallback = (text, language)

    if fallback:
        return fallback
    return "", preferred_languages[0]


def _fetch_transcript_from_rapidapi(video_id: str, preferred_languages: list[str]) -> TranscriptResult:
    api_key = os.getenv("YOUTUBE_TRANSCRIPTOR_RAPIDAPI_KEY") or os.getenv("RAPIDAPI_KEY")
    if not api_key:
        raise YouTubeTranscriptProviderNotConfiguredError("YOUTUBE_TRANSCRIPTOR_RAPIDAPI_KEY is not configured.")

    host = os.getenv("YOUTUBE_TRANSCRIPTOR_RAPIDAPI_HOST") or RAPIDAPI_TRANSCRIPT_HOST
    timeout = int(os.getenv("YOUTUBE_TRANSCRIPTOR_TIMEOUT_SECONDS", "30"))
    last_error: Exception | None = None
    for language in preferred_languages:
        try:
            response = requests.get(
                f"https://{host}/transcript",
                params={"video_id": video_id, "lang": language},
                headers={
                    "x-rapidapi-key": api_key,
                    "x-rapidapi-host": host,
                    "Content-Type": "application/json",
                },
                timeout=timeout,
            )
            if response.status_code in {401, 403}:
                raise YouTubeTranscriptProviderNotConfiguredError("RapidAPI transcript provider is not authorized.")
            if response.status_code == 404:
                raise YouTubeNoTranscriptFoundError("No transcript found for this video.")
            response.raise_for_status()
            text, response_language = _extract_rapidapi_transcript(response.json(), preferred_languages)
            if len(text) >= 50:
                return TranscriptResult(
                    video_id=video_id,
                    language=response_language or language,
                    transcript=text,
                    transcript_length=len(text),
                    token_estimate=estimate_tokens(text),
                )
            if text:
                raise EmptyYouTubeTranscriptError("Transcript is empty or too short.")
        except Exception as exc:
            last_error = exc

    if last_error:
        if isinstance(last_error, YouTubeTranscriptError):
            raise last_error
        raise YouTubeNoTranscriptFoundError("No transcript found from RapidAPI provider.") from last_error
    raise YouTubeNoTranscriptFoundError("No transcript found for this video.")


def fetch_transcript(url: str, languages: list[str] | None = None) -> TranscriptResult:
    video_id = get_video_id(url)
    if not video_id:
        raise InvalidYouTubeUrlError("Invalid YouTube URL.")

    preferred_languages = languages or ["en"]
    return _fetch_transcript_from_rapidapi(video_id, preferred_languages)
