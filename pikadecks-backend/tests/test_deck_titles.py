from app.services import deck_titles


class _TitleResult:
    provider_name = "test"
    title = "Machine Learning Classification"
    candidates = [
        "Machine Learning Classification",
        "Classification Algorithms",
        "Supervised Classification Methods",
    ]


def test_clean_source_title_removes_extensions_versions_and_underscores():
    title = deck_titles.clean_source_title("Operating_System_Chapter_3_Final_Final.pdf")

    assert title == "Operating System Chapter 3"
    assert "_" not in title
    assert ".pdf" not in title.lower()
    assert "Final" not in title


def test_sanitize_deck_title_removes_generic_source_words_and_limits_length():
    title = deck_titles.sanitize_deck_title(
        "YouTube Document Upload Binary Search Fundamentals 2026-06-11 Extra Extra Extra Extra",
        fallback="Binary Search",
    )

    assert title.startswith("Binary Search")
    assert "YouTube" not in title
    assert "Document" not in title
    assert len(title) <= 60


def test_generate_title_uses_ai_when_content_is_available(monkeypatch):
    monkeypatch.setattr(deck_titles, "get_available_providers", lambda: ["groq"])
    monkeypatch.setattr(deck_titles, "generate_deck_title_with_provider", lambda *args, **kwargs: _TitleResult())

    title = deck_titles.generate_study_deck_title(
        source="pdf",
        content="This handout explains supervised learning, classification algorithms, decision boundaries, logistic regression, and evaluation metrics.",
        source_title="UNIT_4_FINAL_NOTES_V2.pdf",
    )

    assert title == "Machine Learning Classification"


def test_generate_title_falls_back_when_content_is_unavailable(monkeypatch):
    monkeypatch.setattr(deck_titles, "get_available_providers", lambda: ["groq"])

    title = deck_titles.generate_study_deck_title(
        source="pdf",
        content="too short",
        source_title="Operating_System_Unit_4_Final_v3.pdf",
    )

    assert title == "Operating System Unit 4"
