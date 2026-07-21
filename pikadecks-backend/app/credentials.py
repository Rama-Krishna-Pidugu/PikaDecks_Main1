import os
import json
from typing import Any, Dict
from app.observability import log_structured_event

_creds_cache: Dict[str, Any] = {}

def load_packaged_credential(filename: str) -> Dict[str, Any]:
    global _creds_cache
    if filename in _creds_cache:
        return _creds_cache[filename]

    env_fallback_var = "FCM_SERVICE_ACCOUNT_JSON" if "firebase" in filename else "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"
    env_val = os.getenv(env_fallback_var, "").strip()
    
    if not env_val and env_fallback_var == "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON":
        env_val = os.getenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64", "").strip()

    if env_val:
        try:
            # Try raw JSON
            parsed = json.loads(env_val)
            if isinstance(parsed, dict) and (parsed.get("client_email") or parsed.get("project_id")):
                _creds_cache[filename] = parsed
                log_structured_event("credentials.loaded_from_env", filename=filename)
                return parsed
        except Exception:
            # Try base64
            import base64
            try:
                decoded = base64.b64decode(env_val).decode("utf-8")
                parsed = json.loads(decoded)
                if isinstance(parsed, dict) and (parsed.get("client_email") or parsed.get("project_id")):
                    _creds_cache[filename] = parsed
                    log_structured_event("credentials.loaded_from_env_base64", filename=filename)
                    return parsed
            except Exception:
                pass

    # Look in the root of the project (credentials/ is at root)
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cred_path = os.path.join(root_dir, "credentials", filename)

    if not os.path.exists(cred_path):
        raise RuntimeError(f"Credential file '{filename}' not found at '{cred_path}' and no valid fallback env var found.")

    try:
        with open(cred_path, "r", encoding="utf-8") as f:
            creds = json.load(f)
            _creds_cache[filename] = creds
            log_structured_event("credentials.loaded_successfully", filename=filename)
            return creds
    except Exception as exc:
        log_structured_event("credentials.load_failed", filename=filename, error=str(exc))
        raise RuntimeError(f"Failed to load or parse credential file '{filename}': {exc}") from exc
