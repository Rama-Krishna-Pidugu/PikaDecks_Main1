from app.services.youtube_transcripts import _extract_rapidapi_transcript, get_video_id, normalize_youtube_url


def test_get_video_id_accepts_supported_youtube_inputs():
    assert get_video_id("pSEtcx4EBB4") == "pSEtcx4EBB4"
    assert get_video_id("https://youtu.be/pSEtcx4EBB4") == "pSEtcx4EBB4"
    assert get_video_id("https://www.youtube.com/watch?v=pSEtcx4EBB4") == "pSEtcx4EBB4"
    assert get_video_id("https://www.youtube.com/shorts/pSEtcx4EBB4") == "pSEtcx4EBB4"
    assert get_video_id("https://www.youtube.com/embed/pSEtcx4EBB4") == "pSEtcx4EBB4"


def test_get_video_id_rejects_incomplete_or_invalid_inputs():
    assert get_video_id("https://www.youtube.com") is None
    assert get_video_id("https://www.youtube.com/watch?v=bad") is None
    assert get_video_id("not a youtube video") is None


def test_normalize_youtube_url_returns_share_url_or_none():
    assert normalize_youtube_url("pSEtcx4EBB4") == "https://youtu.be/pSEtcx4EBB4"
    assert normalize_youtube_url("not a youtube video") is None


def test_extract_rapidapi_transcript_accepts_text_payload():
    text, language = _extract_rapidapi_transcript(
        [{"language": "en", "transcriptionAsText": "This is a useful transcript with enough words to become cards."}],
        ["en"],
    )

    assert language == "en"
    assert text == "This is a useful transcript with enough words to become cards."


def test_extract_rapidapi_transcript_accepts_snippet_payload():
    text, language = _extract_rapidapi_transcript(
        [{
            "language": "te",
            "transcription": [
                {"subtitle": "first transcript line"},
                {"subtitle": "second transcript line"},
            ],
        }],
        ["en"],
    )

    assert language == "te"
    assert text == "first transcript line second transcript line"
