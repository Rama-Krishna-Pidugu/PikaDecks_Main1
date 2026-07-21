import { Platform } from 'react-native';

type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;
type Analytics = unknown;
type FirebaseModules = {
  getApp: () => unknown;
  getAnalytics: (app: unknown) => Analytics;
  logEvent: (
    analytics: Analytics,
    eventName: string,
    params?: Record<string, string | number | boolean>
  ) => Promise<void>;
  setUserId: (analytics: Analytics, userId: string | null) => Promise<void>;
};

export type PikaAnalyticsEvent =
  | 'app_open'
  | 'sign_up'
  | 'sign_in'
  | 'create_deck'
  | 'generate_deck_ai'
  | 'youtube_generation_started'
  | 'youtube_generation_completed'
  | 'youtube_generation_failed'
  | 'youtube_generation_duration'
  | 'youtube_url_submitted'
  | 'flashcards_created_from_youtube'
  | 'deck_opened_from_youtube_generation'
  | 'study_started'
  | 'study_completed'
  | 'notification_sent'
  | 'notification_opened'
  | 'review_reminder_sent'
  | 'review_reminder_opened'
  | 'streak_notification_sent'
  | 'achievement_notification_sent'
  | 'subscription_viewed'
  | 'subscription_started'
  | 'subscription_purchased'
  | 'subscription_failed'
  | 'subscription_cancelled'
  | 'subscription_renewed';

let analyticsInstance: Analytics | null | undefined;
let firebaseModules: FirebaseModules | null | undefined;

function getFirebaseModules(): FirebaseModules | null {
  if (Platform.OS === 'web') {
    return null;
  }

  if (firebaseModules !== undefined) {
    return firebaseModules;
  }

  try {
    const app = require('@react-native-firebase/app') as { getApp: () => unknown };
    const analytics = require('@react-native-firebase/analytics') as Omit<FirebaseModules, 'getApp'>;
    firebaseModules = {
      getApp: app.getApp,
      getAnalytics: analytics.getAnalytics,
      logEvent: analytics.logEvent,
      setUserId: analytics.setUserId,
    };
  } catch (error) {
    firebaseModules = null;
    if (__DEV__) {
      console.warn('[Firebase Analytics] Native module  unavailable:', error);
    }
  }

  return firebaseModules;
}

export function getFirebaseAnalytics(): Analytics | null {
  if (Platform.OS === 'web') {
    return null;
  }

  if (analyticsInstance !== undefined) {
    return analyticsInstance;
  }

  try {
    const modules = getFirebaseModules();
    analyticsInstance = modules ? modules.getAnalytics(modules.getApp()) : null;
  } catch (error) {
    analyticsInstance = null;
    if (__DEV__) {
      console.warn('[Firebase Analytics] Initialization skipped:', error);
    }
  }

  return analyticsInstance;
}

function cleanParams(params?: AnalyticsParams) {
  if (!params) return undefined;

  return Object.entries(params).reduce<Record<string, string | number | boolean>>(
    (acc, [key, value]) => {
      if (value !== null && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    },
    {}
  );
}

export async function logFirebaseEvent(eventName: PikaAnalyticsEvent | string, params?: AnalyticsParams) {
  const analytics = getFirebaseAnalytics();
  if (!analytics) {
    if (__DEV__) console.log('[Firebase Analytics]', eventName, params);
    return;
  }

  const modules = getFirebaseModules();
  if (!modules) return;

  await modules.logEvent(analytics, eventName, cleanParams(params));
}

export async function logFirebaseAppOpen() {
  await logFirebaseEvent('app_open');
}

export async function logFirebaseScreenView(screenName: string, screenClass = screenName) {
  await logFirebaseEvent('screen_view', {
    screen_name: screenName,
    screen_class: screenClass,
  });
}

export async function setFirebaseAnalyticsUserId(userId: string | null) {
  const analytics = getFirebaseAnalytics();
  if (!analytics) {
    if (__DEV__) console.log('[Firebase Analytics] set_user_id', userId);
    return;
  }

  const modules = getFirebaseModules();
  if (!modules) return;

  await modules.setUserId(analytics, userId);
}

export const analyticsEvents = {
  appOpen: () => logFirebaseAppOpen(),
  signUp: (method: string) => logFirebaseEvent('sign_up', { method }),
  signIn: (method: string) => logFirebaseEvent('sign_in', { method }),
  createDeck: (deckId?: string, source = 'manual') =>
    logFirebaseEvent('create_deck', { deck_id: deckId, source }),
  generateDeckAi: (source: 'pdf' | 'notes' | 'youtube', cardCount?: number) =>
    logFirebaseEvent('generate_deck_ai', { source, card_count: cardCount }),
  youtubeUrlSubmitted: () => logFirebaseEvent('youtube_url_submitted'),
  youtubeGenerationStarted: (generationId?: string, requestedCards?: number) =>
    logFirebaseEvent('youtube_generation_started', {
      generation_id: generationId,
      requested_cards: requestedCards,
    }),
  youtubeGenerationCompleted: (params: {
    generationId?: string;
    transcriptLength?: number;
    providerUsed?: string;
    cardsGenerated?: number;
    generationDuration?: number;
    providerCallCount?: number;
  }) =>
    logFirebaseEvent('youtube_generation_completed', {
      generation_id: params.generationId,
      transcript_length: params.transcriptLength,
      provider_used: params.providerUsed,
      cards_generated: params.cardsGenerated,
      generation_duration: params.generationDuration,
      provider_call_count: params.providerCallCount,
    }),
  youtubeGenerationFailed: (params: {
    generationId?: string;
    errorCode?: string;
    generationDuration?: number;
    providerUsed?: string;
  }) =>
    logFirebaseEvent('youtube_generation_failed', {
      generation_id: params.generationId,
      error_code: params.errorCode,
      generation_duration: params.generationDuration,
      provider_used: params.providerUsed,
    }),
  youtubeGenerationDuration: (generationId?: string, durationMs?: number) =>
    logFirebaseEvent('youtube_generation_duration', {
      generation_id: generationId,
      generation_duration: durationMs,
    }),
  flashcardsCreatedFromYoutube: (deckId?: string, cardCount?: number) =>
    logFirebaseEvent('flashcards_created_from_youtube', {
      deck_id: deckId,
      cards_generated: cardCount,
    }),
  deckOpenedFromYoutubeGeneration: (deckId?: string, generationId?: string) =>
    logFirebaseEvent('deck_opened_from_youtube_generation', {
      deck_id: deckId,
      generation_id: generationId,
    }),
  studyStarted: (deckId?: string, cardCount?: number) =>
    logFirebaseEvent('study_started', { deck_id: deckId, card_count: cardCount }),
  studyCompleted: (deckId?: string, cardCount?: number) =>
    logFirebaseEvent('study_completed', { deck_id: deckId, card_count: cardCount }),
  notificationOpened: (type?: string, target?: string) =>
    logFirebaseEvent('notification_opened', { notification_type: type, target }),
  reviewReminderOpened: () => logFirebaseEvent('review_reminder_opened'),
  subscriptionViewed: (plan = 'pro_monthly') =>
    logFirebaseEvent('subscription_viewed', { plan }),
  subscriptionStarted: (productId?: string) =>
    logFirebaseEvent('subscription_started', { product_id: productId }),
  subscriptionPurchased: (productId?: string, status?: string) =>
    logFirebaseEvent('subscription_purchased', { product_id: productId, status }),
  subscriptionFailed: (productId?: string, errorCode?: string) =>
    logFirebaseEvent('subscription_failed', { product_id: productId, error_code: errorCode }),
  subscriptionCancelled: (productId?: string) =>
    logFirebaseEvent('subscription_cancelled', { product_id: productId }),
  subscriptionRenewed: (productId?: string) =>
    logFirebaseEvent('subscription_renewed', { product_id: productId }),
};
