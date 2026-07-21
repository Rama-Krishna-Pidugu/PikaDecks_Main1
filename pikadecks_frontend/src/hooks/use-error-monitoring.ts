import { useCallback } from 'react';
import {
  addBreadcrumb,
  captureException,
  captureMessage,
  clearUserContext,
  setUserContext,
} from '@/lib/errors';

export function useErrorMonitoring(feature?: string) {
  const captureFeatureException = useCallback(
    (error: unknown, action?: string, extra?: Record<string, unknown>) => {
      captureException(error, { feature, action, extra });
    },
    [feature]
  );

  const captureFeatureMessage = useCallback(
    (message: string, action?: string, extra?: Record<string, unknown>) => {
      captureMessage(message, { feature, action, extra });
    },
    [feature]
  );

  const addFeatureBreadcrumb = useCallback(
    (message: string, data?: Record<string, unknown>) => {
      addBreadcrumb(message, data, feature ?? 'app');
    },
    [feature]
  );

  return {
    addBreadcrumb: addFeatureBreadcrumb,
    captureException: captureFeatureException,
    captureMessage: captureFeatureMessage,
    clearUserContext,
    setUserContext,
  };
}
