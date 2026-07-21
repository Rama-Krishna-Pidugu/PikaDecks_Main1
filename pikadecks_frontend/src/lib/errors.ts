import { Sentry } from './sentry';

type ErrorContext = {
  feature?: string;
  action?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

type UserContext = {
  id?: string | null;
  email?: string | null;
  username?: string | null;
};

export function addBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  category = 'app'
) {
  Sentry.addBreadcrumb({
    category,
    level: 'info',
    message,
    data,
  });
}

export function captureException(error: unknown, context?: ErrorContext) {
  Sentry.captureException(error, {
    tags: {
      ...(context?.feature ? { feature: context.feature } : {}),
      ...(context?.action ? { action: context.action } : {}),
      ...context?.tags,
    },
    extra: context?.extra,
  });
}

export function captureMessage(message: string, context?: ErrorContext) {
  Sentry.captureMessage(message, {
    level: 'info',
    tags: {
      ...(context?.feature ? { feature: context.feature } : {}),
      ...(context?.action ? { action: context.action } : {}),
      ...context?.tags,
    },
    extra: context?.extra,
  });
}

export function setUserContext(user: UserContext | null) {
  if (!user?.id) {
    clearUserContext();
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
    username: user.username ?? undefined,
  });
}

export function clearUserContext() {
  Sentry.setUser(null);
}

export function captureStartupFailure(error: unknown) {
  captureException(error, { feature: 'startup', action: 'initialize_app' });
}
