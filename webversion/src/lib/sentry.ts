import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/.*\.execute-api\.ap-south-1\.amazonaws\.com/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  beforeSend(event) {
    const headers = event.request?.headers;
    if (headers) {
      const sensitiveKeys = ["authorization", "cookie", "password", "secret", "token", "key", "dsn"];
      for (const key of Object.keys(headers)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          headers[key] = "[Filtered]";
        }
      }
    }
    return event;
  }
});

/**
 * Track user journeys (e.g. login, signup, purchase, ai_generation)
 */
export function trackUserJourney(
  journey: "login" | "signup" | "deck_creation" | "deck_editing" | "ai_generation" | "subscription_purchase" | "subscription_cancellation",
  status: "success" | "failed" | "started",
  metadata?: Record<string, any>
) {
  Sentry.addBreadcrumb({
    category: "user-journey",
    message: `User journey: ${journey} - ${status}`,
    level: status === "failed" ? "error" : "info",
    data: metadata,
  });

  Sentry.captureMessage(`Journey: ${journey} [${status}]`, {
    level: status === "failed" ? "error" : "info",
    tags: {
      journey,
      status,
      feature: "user_journey",
      ...metadata,
    },
    extra: metadata,
  });
}

/**
 * Track query performance details (execution, hits, refetches)
 */
export function trackQueryOperation(
  queryKey: string,
  operation: "execution" | "refetch" | "cache_hit" | "cache_miss" | "invalidation",
  metadata?: Record<string, any>
) {
  Sentry.addBreadcrumb({
    category: "query-cache",
    message: `Query key: ${queryKey} - ${operation}`,
    level: "info",
    data: metadata,
  });
}

/**
 * Track mutation events (start, success, fail)
 */
export function trackMutationOperation(
  mutationName: string,
  status: "success" | "failed" | "started",
  metadata?: Record<string, any>
) {
  Sentry.addBreadcrumb({
    category: "query-mutation",
    message: `Mutation: ${mutationName} - ${status}`,
    level: status === "failed" ? "error" : "info",
    data: metadata,
  });
}

export default Sentry;
