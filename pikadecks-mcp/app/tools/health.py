from datetime import UTC, datetime
from typing import Any

from mcp.server.fastmcp import FastMCP

from app.config import get_settings


def register_health_tools(mcp: FastMCP) -> None:
    settings = get_settings()

    @mcp.tool(annotations={"readOnlyHint": True})
    def ping() -> dict[str, str]:
        """Verify MCP connectivity."""
        return {
            "status": "connected",
            "service": settings.service_name,
            "version": settings.version,
        }

    @mcp.tool(annotations={"readOnlyHint": True})
    def get_server_info() -> dict[str, str]:
        """Return MCP server metadata."""
        return {
            "name": settings.service_name,
            "environment": settings.environment,
            "status": "healthy",
        }

    @mcp.tool(annotations={"readOnlyHint": True})
    def health_check() -> dict[str, Any]:
        """Verify Lambda execution."""
        return {
            "healthy": True,
            "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }
