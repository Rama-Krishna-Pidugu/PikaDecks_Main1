import os
from functools import lru_cache


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    service_name: str = os.getenv("SERVICE_NAME", "PikaDecks MCP")
    version: str = os.getenv("VERSION", "1.0.0")
    environment: str = os.getenv("ENVIRONMENT", os.getenv("STAGE", "production"))
    log_level: str = os.getenv("LOG_LEVEL", "INFO").upper()
    sentry_dsn: str | None = os.getenv("SENTRY_DSN")
    development_mode: bool = os.getenv("DEVELOPMENT_MODE", "false").lower() == "true"
    allowed_origins: list[str] = _split_csv(
        os.getenv(
            "ALLOWED_ORIGINS",
            ",".join(
                [
                    "https://mcp.pikadecks.app/",
                    "https://pikadecks.app",
                    "https://chatgpt.com",
                    "https://chat.openai.com",
                    "https://claude.ai",
                    "http://localhost:3000",
                    "http://localhost:5173",
                    "http://localhost:8000",
                ]
            ),
        )
    )
    pikadecks_api_url: str = os.getenv("PIKADECKS_API_URL", "http://localhost:8000")


@lru_cache
def get_settings() -> Settings:
    return Settings()
