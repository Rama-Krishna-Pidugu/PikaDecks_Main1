import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

const SENTRY_DSN =
  'https://357b1b509423415acd97bc92d184f352@o4511557674663936.ingest.us.sentry.io/4511563378655232';

const SENSITIVE_KEYS = [
  'authorization',
  'bearer',
  'cookie',
  'password',
  'token',
  'secret',
  'session',
  'code',
  'email_code',
  'upload_url',
  'file_url',
  'presigned',
];

let initialized = false;
let fetchMonitoringInstalled = false;

function getEnvironment() {
  const explicitEnv = process.env.EXPO_PUBLIC_APP_ENV;
  if (explicitEnv === 'development' || explicitEnv === 'preview' || explicitEnv === 'production') {
    return explicitEnv;
  }

  const easProfile = process.env.EAS_BUILD_PROFILE;
  if (easProfile === 'preview' || easProfile === 'production') {
    return easProfile;
  }

  return __DEV__ ? 'development' : 'production';
}

function scrubValue(key: string, value: unknown): unknown {
  const lowerKey = key.toLowerCase();
  if (SENSITIVE_KEYS.some((sensitiveKey) => lowerKey.includes(sensitiveKey))) {
    return '[Filtered]';
  }

  if (typeof value === 'string') {
    return value.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [Filtered]');
  }

  return value;
}

function scrubObject<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scrubObject) as T;

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, entry]) => {
    const scrubbed = scrubValue(key, entry);
    acc[key] = scrubbed && typeof scrubbed === 'object' ? scrubObject(scrubbed) : scrubbed;
    return acc;
  }, {}) as T;
}

function safeUrl(input: RequestInfo | URL) {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  try {
    const url = new URL(rawUrl);
    url.search = '';
    return url.toString();
  } catch {
    return rawUrl.split('?')[0];
  }
}

function isExpectedHttpFailure(status: number, method: string, url: string) {
  if (url.includes('clerk.pikadecks.app/v1/client/sign_ins') && status === 422) {
    return true;
  }

  if (url.includes('clerk.pikadecks.app/v1/client/sign_ups') && status >= 400 && status < 500) {
    return true;
  }

  if (url.includes('clerk.pikadecks.app/v1/client') && method.toUpperCase() === 'POST' && status === 422) {
    return true;
  }

  return false;
}

function installFetchErrorMonitoring() {
  if (fetchMonitoringInstalled || typeof globalThis.fetch !== 'function') return;

  const originalFetch = globalThis.fetch.bind(globalThis);
  fetchMonitoringInstalled = true;

  globalThis.fetch = async (input, init) => {
    const method = init?.method ?? (typeof input !== 'string' && 'method' in input ? input.method : 'GET');
    const url = safeUrl(input);

    try {
      const response = await originalFetch(input, init);
      if (!response.ok) {
        const expectedFailure = isExpectedHttpFailure(response.status, method, url);
        Sentry.addBreadcrumb({
          category: 'api',
          level: expectedFailure ? 'info' : 'warning',
          message: `HTTP ${response.status} ${method} ${url}`,
          data: { status: response.status, method, url },
        });
        if (!expectedFailure) {
          Sentry.captureMessage(`API request failed: HTTP ${response.status}`, {
            level: response.status >= 500 ? 'error' : 'warning',
            tags: { feature: 'api', status: String(response.status) },
            extra: { method, url },
          });
        }
      }
      return response;
    } catch (error) {
      Sentry.addBreadcrumb({
        category: 'api',
        level: 'error',
        message: `Network error ${method} ${url}`,
        data: { method, url },
      });
      Sentry.captureException(error, {
        tags: { feature: 'api', failure_type: 'network' },
        extra: { method, url },
      });
      throw error;
    }
  };
}

export function initSentry() {
  if (initialized) return;
  initialized = true;

  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: true,
    environment: getEnvironment(),
    release: `${Constants.expoConfig?.slug ?? 'pikadecks'}@${Constants.expoConfig?.version ?? '0.0.0'}`,
    dist: Constants.expoConfig?.android?.versionCode?.toString(),
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    profilesSampleRate: __DEV__ ? 1.0 : 0.1,
    attachScreenshot: false,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubObject(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubObject(breadcrumb);
    },
  });

  installFetchErrorMonitoring();
}

export { Sentry };
