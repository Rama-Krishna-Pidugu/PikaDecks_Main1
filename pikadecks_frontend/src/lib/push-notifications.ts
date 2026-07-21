import { PermissionsAndroid, Platform } from 'react-native';
import Constants from 'expo-constants';

function getNotifee() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@notifee/react-native').default as typeof import('@notifee/react-native').default;
  } catch {
    return null;
  }
}
import { analyticsEvents } from '@/lib/firebase';
import { captureException } from '@/lib/errors';
import { callNotificationApi, getPushDeviceId } from './notification-api';
import { 
  setupNotifeeChannels, 
  displayRichNotification, 
  handleNotifeeEvent,
  flushPendingNotificationEvents,
} from './notifee-handlers';

type MessagingModule = {
  getMessaging?: (app?: unknown) => unknown;
  requestPermission?: (messaging: unknown) => Promise<number>;
  getToken?: (messaging: unknown) => Promise<string>;
  onTokenRefresh?: (messaging: unknown, listener: (token: string) => void) => () => void;
  onMessage?: (messaging: unknown, listener: (message: RemoteMessage) => void) => () => void;
  setBackgroundMessageHandler?: (messaging: unknown, handler: (message: RemoteMessage) => Promise<void>) => void;
  onNotificationOpenedApp?: (messaging: unknown, listener: (message: RemoteMessage) => void) => () => void;
  getInitialNotification?: (messaging: unknown) => Promise<RemoteMessage | null>;
  AuthorizationStatus?: { AUTHORIZED: number; PROVISIONAL: number };
};

type RemoteMessage = {
  data?: Record<string, string | undefined>;
  notification?: {
    title?: string;
    body?: string;
  };
};

type RegisterArgs = {
  getToken: () => Promise<string | null>;
  router?: { push: (href: never) => void };
};

let tokenRefreshUnsubscribe: (() => void) | null = null;
let openUnsubscribe: (() => void) | null = null;
let foregroundUnsubscribe: (() => void) | null = null;
let backgroundHandlerRegistered = false;

function getFirebaseMessaging() {
  if (Platform.OS === 'web') return null;

  try {
    const app = require('@react-native-firebase/app') as { getApp?: () => unknown };
    const messaging = require('@react-native-firebase/messaging') as MessagingModule;
    const instance = messaging.getMessaging?.(app.getApp?.());
    return { messaging, instance };
  } catch (error) {
    if (__DEV__) console.warn('[FCM] Messaging unavailable:', error);
    return null;
  }
}

function registerBackgroundFcmHandler() {
  if (backgroundHandlerRegistered) return;

  const firebase = getFirebaseMessaging();
  if (!firebase?.instance || !firebase.messaging.setBackgroundMessageHandler) return;

  firebase.messaging.setBackgroundMessageHandler(firebase.instance, async (message) => {
    if (__DEV__) {
      console.log('[FCM] Background message received', message.data);
    }
    await setupNotifeeChannels();
    await displayRichNotification(message);
  });
  backgroundHandlerRegistered = true;
}

registerBackgroundFcmHandler();

async function requestPermission(messaging: MessagingModule, instance: unknown) {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      return false;
    }
  }

  if (Platform.OS === 'android') {
    return true;
  }

  const status = await messaging.requestPermission?.(instance);
  const authorized = messaging.AuthorizationStatus?.AUTHORIZED;
  const provisional = messaging.AuthorizationStatus?.PROVISIONAL;
  return status === authorized || status === provisional;
}

async function registerToken(getToken: () => Promise<string | null>, pushToken: string) {
  const clerkToken = await getToken();
  if (!clerkToken) return;

  const deviceId = await getPushDeviceId();
  await callNotificationApi('/notifications/device-token', clerkToken, {
    device_id: deviceId,
    push_token: pushToken,
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'unknown',
  });
}

function resolveTarget(message: RemoteMessage) {
  const type = message.data?.type;
  const target = message.data?.target;

  if (target) return target;
  if (type === 'daily_review' || type === 'overdue_review') return '/review/start';
  if (type === 'achievement' || type === 'streak') return '/stats';
  return '/home';
}

async function markOpened(getToken: () => Promise<string | null>, message: RemoteMessage) {
  try {
    const clerkToken = await getToken();
    const idempotencyKey = message.data?.idempotency_key;
    if (!clerkToken || !idempotencyKey) return;
    await callNotificationApi('/notifications/opened', clerkToken, {
      idempotency_key: idempotencyKey,
      notification_type: message.data?.type,
    });
  } catch (error) {
    captureException(error, { feature: 'notifications', action: 'mark_opened' });
  }
}

async function handleOpenedNotification(
  message: RemoteMessage | null,
  getToken: () => Promise<string | null>,
  router?: { push: (href: never) => void },
) {
  if (!message) return;

  const type = message.data?.type;
  const target = resolveTarget(message);
  await analyticsEvents.notificationOpened(type, target);
  if (type === 'daily_review' || type === 'overdue_review') {
    await analyticsEvents.reviewReminderOpened();
  }
  await markOpened(getToken, message);
  router?.push(target as never);
}

// Global Notifee Foreground Event Listener
let notifeeForegroundUnsubscribe: (() => void) | null = null;

export async function setupPushNotifications({ getToken, router }: RegisterArgs) {
  if (Platform.OS === 'web') return;

  const firebase = getFirebaseMessaging();
  if (!firebase?.instance) return;

  try {
    const permitted = await requestPermission(firebase.messaging, firebase.instance);
    if (!permitted) return;

    const pushToken = await firebase.messaging.getToken?.(firebase.instance);
    if (pushToken) {
      await registerToken(getToken, pushToken);
    }

    await flushPendingNotificationEvents(getToken);

    tokenRefreshUnsubscribe?.();
    tokenRefreshUnsubscribe = firebase.messaging.onTokenRefresh?.(firebase.instance, (newToken) => {
      void registerToken(getToken, newToken).catch((error) => {
        captureException(error, { feature: 'notifications', action: 'refresh_token' });
      });
    }) ?? null;

    openUnsubscribe?.();
    openUnsubscribe = firebase.messaging.onNotificationOpenedApp?.(
      firebase.instance,
      (message) => void handleOpenedNotification(message, getToken, router),
    ) ?? null;

    // Ensure Notifee channels are ready
    await setupNotifeeChannels();

    notifeeForegroundUnsubscribe?.();
    const notifee = getNotifee();
    if (notifee) {
      notifeeForegroundUnsubscribe = notifee.onForegroundEvent((event) => {
        void handleNotifeeEvent(event, getToken, router);
      });
    }

    foregroundUnsubscribe?.();
    foregroundUnsubscribe = firebase.messaging.onMessage?.(firebase.instance, async (message) => {
      if (__DEV__) {
        console.log('[FCM] Foreground message received', message.data);
      }
      await analyticsEvents.notificationOpened(message.data?.type, message.data?.target);
      await displayRichNotification(message);
    }) ?? null;

    registerBackgroundFcmHandler();

    const initial = await firebase.messaging.getInitialNotification?.(firebase.instance);
    await handleOpenedNotification(initial ?? null, getToken, router);
  } catch (error) {
    captureException(error, { feature: 'notifications', action: 'setup_push_notifications' });
  }
}

export async function unregisterPushToken(getToken: () => Promise<string | null>) {
  if (Platform.OS === 'web') return;

  const firebase = getFirebaseMessaging();
  if (!firebase?.instance) return;

  try {
    const pushToken = await firebase.messaging.getToken?.(firebase.instance);
    const clerkToken = await getToken();
    const deviceId = await getPushDeviceId();
    if (!clerkToken || !pushToken) return;

    await callNotificationApi('/notifications/device-token', clerkToken, {
      device_id: deviceId,
      push_token: pushToken,
    }, 'DELETE');
  } catch (error) {
    captureException(error, { feature: 'notifications', action: 'unregister_push_token' });
  }
}

export function teardownPushNotifications() {
  tokenRefreshUnsubscribe?.();
  openUnsubscribe?.();
  foregroundUnsubscribe?.();
  notifeeForegroundUnsubscribe?.();
  tokenRefreshUnsubscribe = null;
  openUnsubscribe = null;
  foregroundUnsubscribe = null;
  notifeeForegroundUnsubscribe = null;
}
