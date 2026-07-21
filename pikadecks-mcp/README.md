# PikaDecks MCP Server

Phase 1 production-ready MCP server for PikaDecks connectivity checks.

This service is intentionally separate from:

- `pikadecks-backend` - core FastAPI backend
- `pikadecks_frontend` - React Native app
- `webversion` - public web app

It does not access Supabase, S3, Clerk, billing, quota, flashcard generation, deck creation, or internal backend APIs.

## Endpoints

- `GET /`
- `GET /health`
- `GET /version`
- `GET /mcp`
- `POST /mcp` - MCP Streamable HTTP endpoint

`GET /mcp` returns:

```json
{
  "service": "PikaDecks MCP",
  "status": "running"
}
```

## MCP Tools

### `ping`

```json
{
  "status": "connected",
  "service": "PikaDecks MCP",
  "version": "1.0.0"
}
```

### `get_server_info`

```json
{
  "name": "PikaDecks MCP",
  "environment": "production",
  "status": "healthy"
}
```

### `health_check`

```json
{
  "healthy": true,
  "timestamp": "2026-06-17T12:00:00Z"
}
```

## Request IDs

Every request accepts an optional `X-Request-ID` header. If missing, the service generates a UUID and returns it in the response.

Structured logs include:

```json
{
  "request_id": "uuid",
  "path": "/mcp",
  "method": "POST",
  "status_code": 200,
  "duration_ms": 15
}
```

## Local Testing

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check standard endpoints:

```bash
curl http://localhost:8000/
curl http://localhost:8000/health
curl http://localhost:8000/version
curl http://localhost:8000/mcp
```

Run compile checks:

```bash
python -m compileall app lamda_handler.py
```

Use MCP Inspector against:

```text
http://localhost:8000/mcp
```

## Deployment

Install Serverless dependencies once:

```bash
npm install
```

Deploy:

```bash
serverless deploy --stage prod
```

Set the generated API Gateway URL as `MCP_UPSTREAM_URL` in the `webversion` hosting environment. The web edge proxy forwards:

```text
https://pikadecks.app/mcp
https://pikadecks.app/mcp/*
```

to this standalone Lambda service.

## Environment Variables

- `SERVICE_NAME` - defaults to `PikaDecks MCP`
- `VERSION` - defaults to `1.0.0`
- `ENVIRONMENT` - defaults to deployment stage
- `LOG_LEVEL` - defaults to `INFO`
- `ALLOWED_ORIGINS` - comma-separated CORS allowlist

No database credentials, Clerk secrets, Supabase keys, AWS credentials, or internal backend URLs are required.

## CI/CD

GitHub Actions deploys this service independently:

- push to `developer` -> test deploy
- push to `main` -> production deploy
- manual `workflow_dispatch` -> CI/package validation

Required GitHub secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Optional repository variable:

- `ALLOWED_ORIGINS`
