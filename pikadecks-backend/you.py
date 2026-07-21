import argparse
import sys

from app.services.youtube_transcripts import YouTubeTranscriptError, fetch_transcript, normalize_youtube_url


DEFAULT_URL = "https://youtu.be/pSEtcx4EBB4"


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Fetch and print a YouTube transcript.")
    parser.add_argument(
        "url",
        nargs="?",
        default=DEFAULT_URL,
        help="YouTube URL or video id. Defaults to %(default)s.",
    )
    parser.add_argument(
        "--lang",
        action="append",
        dest="languages",
        help="Preferred transcript language. Can be passed multiple times. Defaults to en.",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Print the full transcript instead of a short preview.",
    )
    args = parser.parse_args()
    youtube_url = normalize_youtube_url(args.url)
    if not youtube_url:
        print("INVALID_YOUTUBE_URL: Enter a YouTube URL or 11-character video id.", file=sys.stderr)
        return 1

    try:
        result = fetch_transcript(youtube_url, args.languages or ["en"])
    except YouTubeTranscriptError as exc:
        print(f"{exc.error_code}: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"TRANSCRIPT_FAILED: {exc}", file=sys.stderr)
        return 1

    transcript = result.transcript if args.full else result.transcript[:1200]
    print(f"video_id: {result.video_id}")
    print(f"language: {result.language}")
    print(f"characters: {result.transcript_length}")
    print(f"estimated_tokens: {result.token_estimate}")
    print()
    print(transcript)
    if not args.full and len(result.transcript) > len(transcript):
        print("\n... use --full to print the complete transcript")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
