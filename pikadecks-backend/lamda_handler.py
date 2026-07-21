from mangum import Mangum

from app.runtime_config import load_runtime_config

load_runtime_config()

from app.main import app

_mangum_handler = Mangum(app)


def handler(event, context):
    # Intercept preflight OPTIONS request
    http_method = None
    if isinstance(event, dict):
        # API Gateway HTTP API (Payload Format 2.0)
        http_method = event.get("requestContext", {}).get("http", {}).get("method")
        # API Gateway REST API / HTTP API (Payload Format 1.0)
        if not http_method:
            http_method = event.get("httpMethod")

    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Max-Age": "86400",
            },
            "body": '{"message": "Preflight OK"}',
        }

    return _mangum_handler(event, context)
