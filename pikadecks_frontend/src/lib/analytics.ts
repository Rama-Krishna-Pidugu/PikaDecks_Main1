import { Platform } from 'react-native';
import {
  logFirebaseEvent,
  logFirebaseScreenView,
  setFirebaseAnalyticsUserId,
} from './firebase';

class AnalyticsService {
  async logScreenView(screenName: string, screenClass: string = 'Unknown') {
    await logFirebaseScreenView(screenName, screenClass);
  }

  async logEvent(eventName: string, params?: Record<string, any>) {
    await logFirebaseEvent(eventName, params);
  }

  async setUserId(userId: string) {
    await setFirebaseAnalyticsUserId(userId);
  }

  logError(error: Error, context?: string) {
    if (Platform.OS === 'web') {
      console.error(context, error);
      return;
    }
    console.error(`[Crashlytics Mock] Error (Context: ${context}):`, error);
  }
}

export const analyticsService = new AnalyticsService();
