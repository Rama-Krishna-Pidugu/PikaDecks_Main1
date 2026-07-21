import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import Sentry from "./lib/sentry";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type RuntimeEnv = {
  MCP_UPSTREAM_URL?: string;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  const lastError = consumeLastCapturedError();
  if (lastError) {
    console.error(lastError);
    Sentry.captureException(lastError);
  } else {
    const defaultError = new Error(`h3 swallowed SSR error: ${body}`);
    console.error(defaultError);
    Sentry.captureException(defaultError);
  }
  return brandedErrorResponse();
}

function isMcpPath(request: Request): boolean {
  const requestUrl = new URL(request.url);
  return requestUrl.pathname === "/mcp" || requestUrl.pathname.startsWith("/mcp/");
}

function getMcpUpstreamUrl(request: Request, env: unknown): URL | undefined {
  if (!isMcpPath(request)) {
    return undefined;
  }

  const upstream = (env as RuntimeEnv | undefined)?.MCP_UPSTREAM_URL;
  if (!upstream) {
    return undefined;
  }

  const upstreamUrl = new URL(upstream);
  const upstreamBasePath = upstreamUrl.pathname.replace(/\/$/, "");
  const incomingPath = requestUrl.pathname;
  const pathSuffix = upstreamBasePath.endsWith("/mcp")
    ? incomingPath.replace(/^\/mcp/, "")
    : incomingPath;

  upstreamUrl.pathname = `${upstreamBasePath}${pathSuffix}` || "/";
  upstreamUrl.search = requestUrl.search;
  return upstreamUrl;
}

async function proxyMcpRequest(request: Request, upstreamUrl: URL): Promise<Response> {
  const requestUrl = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", requestUrl.host);
  headers.set("x-forwarded-proto", requestUrl.protocol.replace(":", ""));

  return fetch(
    new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    }),
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const mcpUpstreamUrl = getMcpUpstreamUrl(request, env);
      if (mcpUpstreamUrl) {
        return await proxyMcpRequest(request, mcpUpstreamUrl);
      }
      if (isMcpPath(request)) {
        return new Response(JSON.stringify({ error: "MCP upstream is not configured" }), {
          status: 503,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      Sentry.captureException(error);
      return brandedErrorResponse();
    }
  },
};
