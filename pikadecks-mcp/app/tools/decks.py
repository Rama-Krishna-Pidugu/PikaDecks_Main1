import httpx
from mcp.server.fastmcp import FastMCP, Context

from app.config import get_settings


def _get_headers(ctx: Context) -> dict:
    token = None
    if ctx and hasattr(ctx, "request_context") and ctx.request_context:
        request = getattr(ctx.request_context, "request", None)
        if request and hasattr(request, "headers"):
            token = request.headers.get("authorization") or request.headers.get("Authorization")
    
    if not token and ctx and hasattr(ctx, "session") and ctx.session:
        creds = getattr(ctx.session, "credentials", None) or getattr(ctx.session, "auth", None)
        if isinstance(creds, dict):
            token = creds.get("access_token") or creds.get("token")
        elif isinstance(creds, str):
            token = creds

    if not token:
        token = ""

    if token and not token.startswith("Bearer "):
        token = f"Bearer {token}"
        
    return {"Authorization": token}


def _handle_error(response: httpx.Response) -> dict:
    try:
        data = response.json()
        error_msg = data.get("detail") or data.get("error") or response.text
    except Exception:
        error_msg = response.text
    return {"success": False, "error": str(error_msg)}


import logging
logger = logging.getLogger("pikadecks-mcp.tools")


def _log_tool_called(tool_name: str, ctx: Context) -> None:
    token = None
    if ctx and hasattr(ctx, "request_context") and ctx.request_context:
        request = getattr(ctx.request_context, "request", None)
        if request and hasattr(request, "headers"):
            token = request.headers.get("authorization") or request.headers.get("Authorization")
    
    if not token and ctx and hasattr(ctx, "session") and ctx.session:
        creds = getattr(ctx.session, "credentials", None) or getattr(ctx.session, "auth", None)
        if isinstance(creds, dict):
            token = creds.get("access_token") or creds.get("token")
        elif isinstance(creds, str):
            token = creds

    user_id = None
    if token:
        try:
            if token.startswith("Bearer "):
                token = token.split("Bearer ")[1]
            import jwt
            payload = jwt.decode(token, options={"verify_signature": False})
            user_id = payload.get("sub")
        except Exception:
            pass

    logger.info({
        "event": "tool_called",
        "tool": tool_name,
        "user_id": user_id
    })


def register_decks_tools(mcp: FastMCP) -> None:
    settings = get_settings()
    base_url = settings.pikadecks_api_url.rstrip('/')

    @mcp.tool()
    async def list_decks(ctx: Context) -> dict:
        """
        List decks from PikaDecks backend.
        """
        _log_tool_called("list_decks", ctx)
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(
                f"{base_url}/mcp/decks",
                headers=_get_headers(ctx)
            )

        if response.is_error:
            return _handle_error(response)
        return response.json()

    @mcp.tool()
    async def get_deck(deck_id: str, ctx: Context) -> dict:
        """
        Get details for a specific deck from PikaDecks backend.
        """
        _log_tool_called("get_deck", ctx)
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(
                f"{base_url}/mcp/decks/{deck_id}",
                headers=_get_headers(ctx)
            )

        if response.is_error:
            return _handle_error(response)
        return response.json()

    @mcp.tool()
    async def create_deck(title: str, description: str = "", ctx: Context = None) -> dict:
        """
        Create a new deck in PikaDecks backend.
        """
        _log_tool_called("create_deck", ctx)
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{base_url}/mcp/decks",
                headers=_get_headers(ctx),
                json={"title": title, "description": description}
            )

        if response.is_error:
            return _handle_error(response)
        return response.json()

    @mcp.tool()
    async def upload_image_to_deck(deck_id: str, base64_image: str, content_type: str = "image/png", filename: str = "image.png", ctx: Context = None) -> dict:
        """
        Upload a base64-encoded image to a specific deck in the PikaDecks backend.
        Returns the `image_key` which can be used in `save_flashcards_to_deck`.
        """
        _log_tool_called("upload_image_to_deck", ctx)
        import base64
        try:
            image_bytes = base64.b64decode(base64_image)
        except Exception as e:
            return {"success": False, "error": f"Invalid base64 string: {e}"}

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{base_url}/decks/{deck_id}/images/upload-url",
                headers=_get_headers(ctx),
                json={"filename": filename, "content_type": content_type, "target": "question"}
            )
            
            if response.is_error:
                return _handle_error(response)
            
            data = response.json()
            upload_url = data.get("upload_url")
            image_key = data.get("image_key")

            if not upload_url:
                return {"success": False, "error": "No upload URL returned from backend"}

            upload_response = await client.put(
                upload_url,
                content=image_bytes,
                headers={"Content-Type": content_type}
            )

            if upload_response.is_error:
                return {"success": False, "error": f"S3 upload failed: {upload_response.text}"}

            return {"success": True, "image_key": image_key}

    @mcp.tool()
    async def save_flashcards_to_deck(deck_id: str, flashcards: list[dict], idempotency_key: str = None, ctx: Context = None) -> dict:
        """
        Save a list of generated flashcards to an existing deck in PikaDecks backend.

        Requirements:
        * Every flashcard dictionary must contain: "front" (or "question"), "back" (or "answer"), and "explanation" string keys.
        * Can optionally contain: "image_key" and "notes_image_key" for S3-backed images.
        * Answers should not be keyword-only.
        * Explanations should provide educational context.
        * Prefer interview-ready and exam-ready content.
        * Avoid one-line answers when a short explanation improves learning.

        Example:
        {
          "front": "What is ApiResponse<T>?",
          "back": "A generic API response wrapper.",
          "explanation": "It standardizes API responses by returning success status, message, timestamp and payload in a consistent format.",
          "image_key": "images/user_123/123_diagram.png",
          "notes_image_key": null
        }

        Limits:
        - Free accounts: Maximum 50 flashcards per request. If more are sent, only the first 50 will be saved.
        - Premium accounts: Maximum 150 flashcards per request.
        """
        _log_tool_called("save_flashcards_to_deck", ctx)
        payload = {"flashcards": flashcards}
        if idempotency_key:
            payload["idempotency_key"] = idempotency_key

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{base_url}/mcp/decks/{deck_id}/flashcards",
                headers=_get_headers(ctx),
                json=payload
            )

        if response.is_error:
            return _handle_error(response)
        return response.json()

    @mcp.tool()
    async def get_deck_cards(deck_id: str, limit: int = 100, offset: int = 0, ctx: Context = None) -> dict:
        """
        Get the list of cards for a specific deck in PikaDecks backend (paginated).
        Use this tool to check if the cards saved successfully.
        """
        _log_tool_called("get_deck_cards", ctx)
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(
                f"{base_url}/mcp/decks/{deck_id}/cards",
                headers=_get_headers(ctx),
                params={"limit": limit, "offset": offset}
            )

        if response.is_error:
            return _handle_error(response)
        return response.json()

    @mcp.tool()
    async def get_api_limits(ctx: Context = None) -> dict:
        """
        Get the current user's subscription plan details, daily deck-creation limits,
        and maximum cards allowed per request for this client.
        """
        _log_tool_called("get_api_limits", ctx)
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(
                f"{base_url}/mcp/limits",
                headers=_get_headers(ctx)
            )

        if response.is_error:
            return _handle_error(response)
        return response.json()
