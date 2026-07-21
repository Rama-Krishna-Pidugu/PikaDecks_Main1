import os
from dataclasses import dataclass
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import HTTPException

from app.observability import capture_backend_exception, trace_span
from app.runtime_config import load_runtime_config

load_dotenv()
load_runtime_config()

SUPABASE_URL = os.getenv("SUPABASE_URL")
if SUPABASE_URL:
    SUPABASE_URL = SUPABASE_URL.strip("'").strip('"')

SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
if SUPABASE_KEY:
    SUPABASE_KEY = SUPABASE_KEY.strip("'").strip('"')


@dataclass
class SupabaseResponse:
    data: Any
    count: int | None = None


class SupabaseTable:
    def __init__(self, table_name: str):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise HTTPException(
                status_code=500,
                detail="SUPABASE_URL and SUPABASE_KEY/SUPABASE_SERVICE_KEY must be configured",
            )

        self.table_name = table_name
        self.url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table_name}"
        self.method = "GET"
        self.params: dict[str, str] = {}
        self.payload: dict[str, Any] | None = None
        self._count_mode: str | None = None
        self.headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def select(self, *columns: str, count: str | None = None):
        self.method = "GET"
        self.params["select"] = ", ".join(columns) if columns else "*"
        if count:
            # PostgREST returns row count in Content-Range header when this Prefer is set
            self._count_mode = count  # e.g. "exact", "planned", "estimated"
            self.headers["Prefer"] = f"count={count}"
        return self

    def insert(self, payload: dict | list):
        self.method = "POST"
        self.payload = payload
        return self

    def upsert(self, payload: dict | list, on_conflict: str | None = None):
        self.method = "POST"
        self.payload = payload
        self.headers["Prefer"] = "resolution=merge-duplicates,return=representation"
        if on_conflict:
            self.params["on_conflict"] = on_conflict
        return self

    def update(self, payload: dict[str, Any]):
        self.method = "PATCH"
        self.payload = payload
        return self

    def delete(self):
        self.method = "DELETE"
        return self

    def _add_filter(self, column: str, filter_expr: str):
        if column in self.params:
            self.params[column] = f"{self.params[column]},{filter_expr}"
        else:
            self.params[column] = filter_expr

    def eq(self, column: str, value: Any):
        self._add_filter(column, f"eq.{value}")
        return self

    def gte(self, column: str, value: Any):
        self._add_filter(column, f"gte.{value}")
        return self

    def lte(self, column: str, value: Any):
        self._add_filter(column, f"lte.{value}")
        return self

    def gt(self, column: str, value: Any):
        self._add_filter(column, f"gt.{value}")
        return self

    def lt(self, column: str, value: Any):
        self._add_filter(column, f"lt.{value}")
        return self

    def in_(self, column: str, values: list[Any]):
        formatted = ",".join(str(value) for value in values)
        self._add_filter(column, f"in.({formatted})")
        return self

    def like(self, column: str, pattern: str):
        self._add_filter(column, f"like.{pattern}")
        return self

    def order(self, column: str, desc: bool = False):
        direction = "desc" if desc else "asc"
        self.params["order"] = f"{column}.{direction}"
        return self

    def limit(self, count: int):
        self.params["limit"] = str(count)
        return self

    def range(self, start: int, end: int):
        self.headers["Range"] = f"{start}-{end}"
        self.headers["Range-Unit"] = "items"
        return self

    def single(self):
        self.headers["Accept"] = "application/vnd.pgrst.object+json"
        return self

    def execute(self):
        params_list = []
        for k, v in self.params.items():
            if k not in ("select", "order", "limit", "on_conflict") and "," in str(v) and not str(v).startswith("in.("):
                for part in str(v).split(","):
                    params_list.append((k, part))
            else:
                params_list.append((k, v))

        try:
            with trace_span(
                op="db",
                description=f"SupabaseTable.{self.method} {self.table_name}",
                tags={"table": self.table_name, "method": self.method, "component": "supabase"},
                data={"params": self.params}
            ):
                response = requests.request(
                    self.method,
                    self.url,
                    params=params_list,
                    json=self.payload,
                    headers=self.headers,
                    timeout=15,
                )
        except requests.RequestException as exc:
            capture_backend_exception(
                exc,
                feature="database",
                action="supabase_request_failed",
                tags={
                    "table": self.table_name,
                    "method": self.method,
                    "component": "supabase",
                },
                extra={
                    "params": self.params,
                    "payload_type": type(self.payload).__name__,
                },
            )
            raise HTTPException(
                status_code=502,
                detail={
                    "supabase_error": "Failed to reach Supabase",
                    "table": self.table_name,
                    "method": self.method,
                    "error": str(exc),
                },
            )

        if response.status_code == 406:
            return SupabaseResponse(data=None)

        if response.status_code >= 400:
            capture_backend_exception(
                HTTPException(status_code=response.status_code, detail=response.text),
                feature="database",
                action="supabase_error_response",
                tags={
                    "table": self.table_name,
                    "method": self.method,
                    "component": "supabase",
                    "status_code": response.status_code,
                },
                extra={
                    "params": self.params,
                    "response_preview": response.text[:300],
                },
            )
            raise HTTPException(
                status_code=response.status_code,
                detail={
                    "supabase_error": response.text,
                    "table": self.table_name,
                    "method": self.method,
                },
            )

        if not response.text.strip():
            return SupabaseResponse(data=None)

        # Parse row count from Content-Range header when count mode was requested.
        # PostgREST returns e.g. "0-9/42" or "*/42" where 42 is the total count.
        parsed_count: int | None = None
        if self._count_mode:
            content_range = response.headers.get("Content-Range", "")
            if "/" in content_range:
                try:
                    parsed_count = int(content_range.split("/")[-1])
                except (ValueError, IndexError):
                    parsed_count = None

        try:
            return SupabaseResponse(data=response.json(), count=parsed_count)
        except ValueError as exc:
            capture_backend_exception(
                exc,
                feature="database",
                action="supabase_non_json_response",
                tags={
                    "table": self.table_name,
                    "method": self.method,
                    "component": "supabase",
                    "status_code": response.status_code,
                },
                extra={
                    "response_preview": response.text[:300],
                },
            )
            raise HTTPException(
                status_code=502,
                detail={
                    "supabase_error": "Supabase returned a non-JSON response",
                    "table": self.table_name,
                    "method": self.method,
                    "status_code": response.status_code,
                    "response_preview": response.text[:300],
                },
            )


class SupabaseRpc:
    def __init__(self, function_name: str, payload: dict[str, Any] | None = None):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise HTTPException(
                status_code=500,
                detail="SUPABASE_URL and SUPABASE_KEY/SUPABASE_SERVICE_KEY must be configured",
            )

        self.function_name = function_name
        self.url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/rpc/{function_name}"
        self.payload = payload or {}
        self.headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        }

    def execute(self):
        try:
            with trace_span(
                op="db",
                description=f"SupabaseRpc.{self.function_name}",
                tags={"function": self.function_name, "component": "supabase"},
                data={"payload_keys": list(self.payload.keys()) if isinstance(self.payload, dict) else []}
            ):
                response = requests.post(
                    self.url,
                    json=self.payload,
                    headers=self.headers,
                    timeout=15,
                )
        except requests.RequestException as exc:
            capture_backend_exception(
                exc,
                feature="database",
                action="supabase_rpc_request_failed",
                tags={
                    "function": self.function_name,
                    "component": "supabase",
                },
                extra={"payload_keys": list(self.payload.keys())},
            )
            raise HTTPException(
                status_code=502,
                detail={
                    "supabase_error": "Failed to reach Supabase RPC",
                    "function": self.function_name,
                    "error": str(exc),
                },
            )

        if response.status_code >= 400:
            capture_backend_exception(
                HTTPException(status_code=response.status_code, detail=response.text),
                feature="database",
                action="supabase_rpc_error_response",
                tags={
                    "function": self.function_name,
                    "component": "supabase",
                    "status_code": response.status_code,
                },
                extra={"response_preview": response.text[:300]},
            )
            raise HTTPException(
                status_code=response.status_code,
                detail={
                    "supabase_error": response.text,
                    "function": self.function_name,
                },
            )

        if not response.text.strip():
            return SupabaseResponse(data=None)

        try:
            return SupabaseResponse(data=response.json())
        except ValueError as exc:
            capture_backend_exception(
                exc,
                feature="database",
                action="supabase_rpc_non_json_response",
                tags={
                    "function": self.function_name,
                    "component": "supabase",
                    "status_code": response.status_code,
                },
                extra={"response_preview": response.text[:300]},
            )
            raise HTTPException(
                status_code=502,
                detail={
                    "supabase_error": "Supabase RPC returned a non-JSON response",
                    "function": self.function_name,
                    "status_code": response.status_code,
                    "response_preview": response.text[:300],
                },
            )


class SupabaseRestClient:
    def table(self, table_name: str):
        return SupabaseTable(table_name)

    def rpc(self, function_name: str, payload: dict[str, Any] | None = None):
        return SupabaseRpc(function_name, payload)


supabase = SupabaseRestClient()
