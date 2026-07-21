import os

from fastapi.testclient import TestClient

os.environ["SENTRY_DSN"] = ""
os.environ["SENTRY_ENVIRONMENT"] = "test"

from app.main import app


def test_root_health_check():
    client = TestClient(app)

    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"message": "PikaDecks Backend Running"}
