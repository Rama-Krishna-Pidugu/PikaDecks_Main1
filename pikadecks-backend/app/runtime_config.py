import os

from dotenv import load_dotenv


PARAMETER_ENV_MAP = {
    "supabase_url": "SUPABASE_URL",
    "fcm_service_account_json": "FCM_SERVICE_ACCOUNT_JSON",
    "google_play_service_account_json": "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
}

_loaded = False


def load_runtime_config():
    global _loaded
    if _loaded:
        return

    load_dotenv()

    prefix = os.getenv("APP_CONFIG_PARAMETER_PREFIX")
    if prefix:
        try:
            import boto3

            ssm = boto3.client(
                "ssm",
                region_name=os.getenv("AWS_REGION") or os.getenv("PIKA_AWS_REGION") or "ap-south-1",
            )

            for key, env_name in PARAMETER_ENV_MAP.items():
                parameter_name = f"{prefix.rstrip('/')}/{key}"
                try:
                    response = ssm.get_parameter(
                        Name=parameter_name,
                        WithDecryption=True,
                    )
                    value = response.get("Parameter", {}).get("Value")
                    if value:
                        os.environ[env_name] = value
                except Exception as param_exc:
                    print(f"[CONFIG] Failed to load SSM parameter {parameter_name}: {param_exc}")
                    if not os.environ.get(env_name):
                        raise
        except Exception as exc:
            print(f"[CONFIG] SSM lookup failed or was skipped for prefix {prefix}: {exc}")
            missing = [env_name for env_name in PARAMETER_ENV_MAP.values() if not os.environ.get(env_name)]
            if missing:
                print(f"[CONFIG] Critical environment variables missing and SSM lookup failed: {missing}")
                raise

    if os.getenv("SUPABASE_SERVICE_KEY") and not os.getenv("SUPABASE_KEY"):
        os.environ["SUPABASE_KEY"] = os.getenv("SUPABASE_SERVICE_KEY", "")

    # Validate required OAuth secrets on startup
    if not os.getenv("OAUTH_JWT_SECRET") or not os.getenv("OAUTH_REFRESH_SECRET"):
        raise RuntimeError(
            "CRITICAL CONFIGURATION ERROR: Both OAUTH_JWT_SECRET and OAUTH_REFRESH_SECRET environment variables must be set on startup."
        )

    _loaded = True
