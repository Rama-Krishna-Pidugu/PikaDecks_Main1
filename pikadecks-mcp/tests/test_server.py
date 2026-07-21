from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_mcp_debug_endpoint():
    response = client.get("/mcp-status", headers={"X-Request-ID": "test-request-id"})

    assert response.status_code == 200
    assert response.json() == {"service": "PikaDecks MCP", "status": "running"}
    assert response.headers["x-request-id"] == "test-request-id"


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["healthy"] is True


def test_version_endpoint():
    response = client.get("/version")

    assert response.status_code == 200
    assert response.json()["version"] == "1.0.0"


def test_oauth_metadata():
    response = client.get("/.well-known/oauth-authorization-server")
    assert response.status_code == 200
    data = response.json()
    assert data["issuer"] == "https://mcp.pikadecks.app/"
    assert data["authorization_endpoint"] == "https://mcp.pikadecks.app/oauth/authorize"
    assert data["token_endpoint"] == "https://mcp.pikadecks.app/oauth/token"


def test_oauth_protected_resource():
    response = client.get("/.well-known/oauth-protected-resource")
    assert response.status_code == 200
    data = response.json()
    assert data["resource"] == "https://mcp.pikadecks.app/"
    assert data["authorization_servers"] == ["https://mcp.pikadecks.app/"]


# def test_streamable_mcp_requires_auth():
#     response = client.post("/", json={})
#     assert response.status_code == 401
#     assert "www-authenticate" in response.headers
#     www_auth = response.headers["www-authenticate"]
#     assert "Bearer" in www_auth
#     assert "resource_metadata=" in www_auth


