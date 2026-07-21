import pytest
from fastapi import HTTPException

from app.services import ai_usage_quota


class _RpcCall:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return self


class _FakeSupabase:
    def __init__(self, data):
        self.data = data
        self.calls = []

    def rpc(self, function_name, payload):
        self.calls.append((function_name, payload))
        return _RpcCall(self.data)


def test_get_quota_returns_reset_free_window(monkeypatch):
    fake = _FakeSupabase({
        "allowed": True,
        "usage_count": 0,
        "limit": 10,
        "remaining": 10,
        "quota_reset_at": "2026-06-12T10:00:00Z",
    })
    monkeypatch.setattr(ai_usage_quota, "supabase", fake)
    monkeypatch.setattr(ai_usage_quota, "is_pro_user", lambda user_id: False)

    quota = ai_usage_quota.get_ai_generation_quota("user-1")

    assert quota["used"] == 0
    assert quota["remaining"] == 10
    assert quota["limit"] == 10
    assert quota["resetsAt"] == "2026-06-12T10:00:00Z"
    assert fake.calls[0][0] == "get_ai_generation_quota"


def test_consume_quota_increments_and_updates_remaining(monkeypatch):
    fake = _FakeSupabase({
        "allowed": True,
        "usage_count": 6,
        "limit": 10,
        "remaining": 4,
        "quota_reset_at": "2026-06-12T10:00:00Z",
    })
    monkeypatch.setattr(ai_usage_quota, "supabase", fake)
    monkeypatch.setattr(ai_usage_quota, "is_pro_user", lambda user_id: False)

    quota = ai_usage_quota.consume_ai_generation_quota("user-1", source="pdf")

    assert quota["used"] == 6
    assert quota["remaining"] == 4
    assert fake.calls[0][0] == "check_and_increment_ai_generation_quota"


def test_free_user_is_limited_at_ten(monkeypatch):
    fake = _FakeSupabase({
        "allowed": False,
        "usage_count": 10,
        "limit": 10,
        "remaining": 0,
        "quota_reset_at": "2026-06-12T10:00:00Z",
    })
    monkeypatch.setattr(ai_usage_quota, "supabase", fake)
    monkeypatch.setattr(ai_usage_quota, "is_pro_user", lambda user_id: False)

    with pytest.raises(HTTPException) as exc:
        ai_usage_quota.consume_ai_generation_quota("user-1", source="notes")

    assert exc.value.status_code == 429
    assert exc.value.detail["code"] == "FREE_LIMIT_REACHED"
    assert exc.value.detail["usage"]["remaining"] == 0


def test_premium_user_bypasses_quota_rpc(monkeypatch):
    fake = _FakeSupabase({})
    monkeypatch.setattr(ai_usage_quota, "supabase", fake)
    monkeypatch.setattr(ai_usage_quota, "is_pro_user", lambda user_id: True)

    quota = ai_usage_quota.consume_ai_generation_quota("user-1", source="youtube")

    assert quota["unlimited"] is True
    assert quota["remaining"] is None
    assert fake.calls == []
