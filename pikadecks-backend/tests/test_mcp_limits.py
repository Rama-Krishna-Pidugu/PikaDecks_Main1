import os
import jwt
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# Helper to generate mock tokens
def make_mock_token(user_id="00000000-0000-0000-0000-000000000001", client_id="chatgpt", scope="write:decks write:cards"):
    payload = {
        "sub": user_id,
        "client_id": client_id,
        "scope": scope,
        "iss": "https://mcp.pikadecks.app/",
        "aud": "https://mcp.pikadecks.app/",
        "iat": 1000000000,
        "exp": 9999999999
    }
    jwt_secret = os.getenv("OAUTH_JWT_SECRET", "supersecretkey")
    return jwt.encode(payload, jwt_secret, algorithm="HS256")


@patch("app.routes.mcp.supabase")
@patch("app.routes.mcp.get_user_plan")
def test_mcp_limits_endpoint(mock_get_user_plan, mock_supabase):
    mock_get_user_plan.return_value = "free"
    
    # Mock counting decks today
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.lt.return_value.execute.return_value.data = [
        {"id": "event-1"}, {"id": "event-2"}
    ]
    
    token = make_mock_token(client_id="chatgpt")
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.get("/mcp/limits", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["plan"] == "free"
    assert data["client_id"] == "chatgpt"
    assert data["decks_created_today"] == 2
    assert data["max_decks_per_day"] == 10
    assert data["max_cards_per_request"] == 50


@patch("app.routes.mcp.supabase")
@patch("app.routes.mcp.get_user_plan")
def test_mcp_create_deck_limit_free_reached(mock_get_user_plan, mock_supabase):
    mock_get_user_plan.return_value = "free"
    
    # Mock having 10 decks today already
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.lt.return_value.execute.return_value.data = [
        {"id": f"event-{i}"} for i in range(10)
    ]
    
    token = make_mock_token(client_id="claude")
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.post("/mcp/decks", headers=headers, json={"title": "New Deck"})
    assert response.status_code == 403
    assert "Daily deck limit reached" in response.json()["detail"]


@patch("app.routes.mcp.supabase")
@patch("app.routes.mcp.get_user_plan")
def test_mcp_save_flashcards_free_truncation(mock_get_user_plan, mock_supabase):
    mock_get_user_plan.return_value = "free"
    
    # Mock deck lookup validation
    mock_deck = MagicMock()
    mock_deck.data = [{"deck_id": "00000000-0000-0000-0000-000000000005"}]
    
    # Mock card insert and review state
    mock_inserted = MagicMock()
    mock_inserted.data = [{"card_id": f"00000000-0000-0000-0000-000000000{i:03d}"} for i in range(50)]
    
    def mock_table(name):
        mock_t = MagicMock()
        if name == "decks":
            mock_t.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_deck
        elif name == "cards":
            mock_t.insert.return_value.execute.return_value = mock_inserted
        elif name == "mcp_request_log":
            mock_t.select.return_value.eq.return_value.execute.return_value.data = []
        return mock_t
        
    mock_supabase.table.side_effect = mock_table
    
    token = make_mock_token(client_id="chatgpt")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Send 60 cards
    cards = [{"front": f"Q{i}", "back": f"A{i}"} for i in range(60)]
    response = client.post("/mcp/decks/00000000-0000-0000-0000-000000000005/flashcards", headers=headers, json={"flashcards": cards})
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["cards_created"] == 50
    assert "only the first 50 have been saved" in data["warning_message"]


@patch("app.routes.mcp.supabase")
@patch("app.routes.mcp.get_user_plan")
def test_mcp_save_flashcards_idempotency_replay(mock_get_user_plan, mock_supabase):
    mock_get_user_plan.return_value = "pro"
    
    # Mock idempotency key log found
    mock_log = MagicMock()
    mock_log.data = [{
        "idempotency_key": "test-key-123",
        "status": "success",
        "response": {"success": True, "cards_created": 3, "idempotent_replay": True}
    }]
    
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_log
    
    token = make_mock_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.post(
        "/mcp/decks/00000000-0000-0000-0000-000000000005/flashcards",
        headers=headers,
        json={"flashcards": [], "idempotency_key": "test-key-123"}
    )
    
    assert response.status_code == 200
    assert response.json()["idempotent_replay"] is True


@patch("app.routes.mcp.supabase")
@patch("app.routes.mcp.get_user_plan")
def test_mcp_get_deck_cards_endpoint(mock_get_user_plan, mock_supabase):
    mock_get_user_plan.return_value = "pro"
    
    # Mock deck exists
    mock_deck = MagicMock()
    mock_deck.data = [{"deck_id": "00000000-0000-0000-0000-000000000005", "title": "BPTT"}]
    
    # Mock count response
    mock_count = MagicMock()
    mock_count.data = [{"card_id": "c1"}, {"card_id": "c2"}]
    
    # Mock paginated cards
    mock_cards = MagicMock()
    mock_cards.data = [
        {"card_id": "c1", "question": "Q1", "answer": "A1"},
        {"card_id": "c2", "question": "Q2", "answer": "A2"}
    ]
    
    def mock_table(name):
        mock_t = MagicMock()
        if name == "decks":
            mock_t.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_deck
        elif name == "cards":
            # first select for count, then second select with range
            mock_t.select.return_value.eq.return_value.execute.return_value = mock_count
            mock_t.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = mock_cards
        return mock_t
        
    mock_supabase.table.side_effect = mock_table
    
    token = make_mock_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.get("/mcp/decks/00000000-0000-0000-0000-000000000005/cards?limit=10&offset=0", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["deck_title"] == "BPTT"
    assert data["card_count"] == 2
    assert len(data["cards"]) == 2
