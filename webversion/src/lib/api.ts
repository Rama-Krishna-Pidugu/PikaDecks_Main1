export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  console.error("Missing VITE_API_URL environment variable.");
}

export type TokenGetter = () => Promise<string | null | undefined>;

export class ApiError extends Error {
  status: number;
  detail: unknown;
  code?: string;

  constructor(message: string, status: number, detail?: unknown, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

export async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(data: any, fallback: string) {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (typeof data.detail === "string") return data.detail;
  if (typeof data.message === "string") return data.message;
  if (typeof data.detail?.message === "string") return data.detail.message;
  if (typeof data.detail?.code === "string") return data.detail.code;
  return fallback;
}

export async function getClerkToken(getToken?: TokenGetter) {
  if (getToken) return getToken();
  return window.Clerk?.session?.getToken?.();
}

import Sentry from "./sentry";

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { getToken?: TokenGetter; bodyJson?: unknown } = {},
): Promise<T> {
  const method = options.method || "GET";
  
  return Sentry.startSpan({
    op: "http.client",
    name: `${method} ${path}`,
  }, async (span) => {
    const token = await getClerkToken(options.getToken);
    if (!token) {
      const authErr = new ApiError("Missing auth token. Please sign in again.", 401);
      Sentry.captureException(authErr, {
        tags: { operation_type: "auth_failure", endpoint: path },
      });
      throw authErr;
    }

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (options.bodyJson !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        body: options.bodyJson !== undefined ? JSON.stringify(options.bodyJson) : options.body,
      });

      if (span) {
        span.setAttribute("http.status_code", response.status_code || response.status);
      }

      const data = await readJsonResponse(response);

      if (!response.ok) {
        const detail = typeof data === "object" && data !== null ? (data as any).detail : data;
        const code =
          typeof detail === "object" && detail !== null && "code" in detail
            ? String((detail as any).code)
            : undefined;
        const apiError = new ApiError(getErrorMessage(data, `Request failed: HTTP ${response.status}`), response.status, data, code);
        
        Sentry.captureException(apiError, {
          tags: {
            operation_type: "api_fetch_failure",
            endpoint: path,
            status_code: response.status,
          },
          extra: { responseData: data },
        });

        throw apiError;
      }

      return data as T;
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      Sentry.captureException(err, {
        tags: {
          operation_type: "network_failure",
          endpoint: path,
        },
      });
      throw err;
    }
  });
}

export async function syncUser(getToken?: TokenGetter) {
  return apiFetch<{ success?: boolean }>("/sync-user", {
    method: "POST",
    getToken,
    bodyJson: {},
  });
}
