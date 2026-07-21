import os
import time
import secrets
import jwt
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.routes.oauth import hash_token

client = TestClient(app)


@patch("app.routes.oauth.supabase")
def test_oauth_authorize_success(mock_supabase):
    # Mock finding a valid active client
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {
            "client_id": "test-client",
            "client_name": "Test Client",
            "redirect_uri": "http://localhost/callback",
            "active": True
        }
    ]

    response = client.get(
        "/oauth/authorize?client_id=test-client&redirect_uri=http://localhost/callback&response_type=code&state=123",
        follow_redirects=False
    )
    assert response.status_code in (302, 307)
    assert "oauth/consent" in response.headers["location"]


@patch("app.routes.oauth.supabase")
def test_oauth_authorize_mismatch_uri(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {
            "client_id": "test-client",
            "client_name": "Test Client",
            "redirect_uri": "http://localhost/callback",
            "active": True
        }
    ]

    response = client.get(
        "/oauth/authorize?client_id=test-client&redirect_uri=http://wronghost/callback&response_type=code",
        follow_redirects=False
    )
    assert response.status_code == 400
    assert "Redirect URI mismatch" in response.json()["detail"]


@patch("app.routes.oauth.supabase")
@patch("app.routes.oauth.verify_token")
def test_oauth_consent_approve_success(mock_verify_token, mock_supabase):
    # Mock Clerk token verification
    mock_verify_token.return_value = {"sub": "clerk-user-123"}

    # Mock user lookup
    mock_user_res = MagicMock()
    mock_user_res.data = [{"user_id": "00000000-0000-0000-0000-000000000002"}]

    # Mock client lookup
    mock_client_res = MagicMock()
    mock_client_res.data = [
        {
            "client_id": "test-client",
            "redirect_uri": "http://localhost/callback",
            "active": True
        }
    ]

    # Map tables
    def mock_table(name):
        mock_t = MagicMock()
        if name == "users":
            mock_t.select.return_value.eq.return_value.execute.return_value = mock_user_res
        elif name == "oauth_clients":
            mock_t.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_client_res
        return mock_t

    mock_supabase.table.side_effect = mock_table

    response = client.post(
        "/oauth/consent/approve",
        json={
            "client_id": "test-client",
            "redirect_uri": "http://localhost/callback",
            "state": "mystate",
            "scope": "read:decks",
            "clerk_token": "valid-clerk-token"
        }
    )
    assert response.status_code == 200
    assert "redirect_url" in response.json()
    assert "code=" in response.json()["redirect_url"]
    assert "state=mystate" in response.json()["redirect_url"]


@patch("app.routes.oauth.supabase")
def test_oauth_token_exchange_success(mock_supabase):
    # Mock authorization code retrieval
    mock_code_res = MagicMock()
    mock_code_res.data = [
        {
            "code": "test-code",
            "user_id": "00000000-0000-0000-0000-000000000002",
            "client_id": "test-client",
            "redirect_uri": "http://localhost/callback",
            "scope": "read:decks",
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        }
    ]

    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_code_res

    # Setup environment secrets
    os.environ["OAUTH_JWT_SECRET"] = "test-signing-secret"
    os.environ["OAUTH_REFRESH_SECRET"] = "test-refresh-secret"

    response = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": "test-code",
            "redirect_uri": "http://localhost/callback",
            "client_id": "test-client"
        }
    )
    assert response.status_code == 200, f"Token exchange failed: {response.text}"
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "Bearer"

    # Decode and check claims
    decoded = jwt.decode(
        data["access_token"],
        "test-signing-secret",
        algorithms=["HS256"],
        issuer="https://mcp.pikadecks.app/",
        audience="https://mcp.pikadecks.app/"
    )
    assert decoded["sub"] == "00000000-0000-0000-0000-000000000002"
    assert decoded["client_id"] == "test-client"
    assert decoded["scope"] == "read:decks"
