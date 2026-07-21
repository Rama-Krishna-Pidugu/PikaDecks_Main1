import type {
  AndroidImportance,
  AndroidVisibility,
  AndroidStyle,
  EventType,
  Event,
  AndroidCategory
} from '@notifee/react-native';

function getNotifee() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@notifee/react-native');
    return mod.default as typeof import('@notifee/react-native').default;
  } catch {
    return null;
  }
}

function getNotifeeEnums() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@notifee/react-native') as typeof import('@notifee/react-native');
  } catch {
    return null;
  }
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { captureException } from '@/lib/errors';
import { callNotificationApi } from './notification-api';

export const CHANNELS = {
  REVIEWS: 'reviews',
  STREAKS: 'streaks',
  ACHIEVEMENTS: 'achievements',
  SYSTEM: 'system',
  MARKETING: 'marketing',
};

const PENDING_NOTIFICATION_EVENTS_KEY = 'pikadecks:pending-notification-events';

type PendingNotificationEvent = {
  path: '/notifications/action' | '/notifications/opened';
  body: Record<string, unknown>;
};

async function queuePendingNotificationEvent(event: PendingNotificationEvent) {
  const existing = await AsyncStorage.getItem(PENDING_NOTIFICATION_EVENTS_KEY);
  const pending = existing ? JSON.parse(existing) as PendingNotificationEvent[] : [];
  pending.push(event);
  await AsyncStorage.setItem(PENDING_NOTIFICATION_EVENTS_KEY, JSON.stringify(pending.slice(-50)));
}

async function sendOrQueueNotificationEvent(
  getToken: () => Promise<string | null>,
  event: PendingNotificationEvent,
) {
  const clerkToken = await getToken();
  if (!clerkToken) {
    await queuePendingNotificationEvent(event);
    return;
  }

  await callNotificationApi(event.path, clerkToken, event.body);
}

export async function flushPendingNotificationEvents(getToken: () => Promise<string | null>) {
  try {
    const clerkToken = await getToken();
    if (!clerkToken) return;

    const existing = await AsyncStorage.getItem(PENDING_NOTIFICATION_EVENTS_KEY);
    const pending = existing ? JSON.parse(existing) as PendingNotificationEvent[] : [];
    if (!pending.length) return;

    const failed: PendingNotificationEvent[] = [];
    for (const event of pending) {
      try {
        await callNotificationApi(event.path, clerkToken, event.body);
      } catch {
        failed.push(event);
      }
    }

    if (failed.length) {
      await AsyncStorage.setItem(PENDING_NOTIFICATION_EVENTS_KEY, JSON.stringify(failed.slice(-50)));
    } else {
      await AsyncStorage.removeItem(PENDING_NOTIFICATION_EVENTS_KEY);
    }
  } catch (error) {
    captureException(error, { feature: 'notifee', action: 'flush_pending_events' });
  }
}

/**
 * Ensures all Android notification channels are created.
 */
export async function setupNotifeeChannels() {
  if (Platform.OS !== 'android') return;
  const notifee = getNotifee();
  const enums = getNotifeeEnums();
  if (!notifee || !enums) return;
  const { AndroidImportance, AndroidVisibility } = enums;

  try {
    await notifee.createChannels([
      {
        id: CHANNELS.REVIEWS,
        name: 'Study Reviews',
        description: 'Reminders for daily and overdue reviews',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
      },
      {
        id: CHANNELS.STREAKS,
        name: 'Streaks',
        description: 'Updates and warnings about your daily streak',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
      },
      {
        id: CHANNELS.ACHIEVEMENTS,
        name: 'Achievements',
        description: 'Notifications when you unlock new achievements',
        importance: AndroidImportance.DEFAULT,
        visibility: AndroidVisibility.PUBLIC,
      },
      {
        id: CHANNELS.SYSTEM,
        name: 'System',
        description: 'Important system and account notifications',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.SECRET,
      },
      {
        id: CHANNELS.MARKETING,
        name: 'News & Updates',
        description: 'New features and promotional updates',
        importance: AndroidImportance.LOW,
      },
    ]);
  } catch (error) {
    captureException(error, { feature: 'notifee', action: 'setup_channels' });
  }
}

function resolveChannel(type?: string): string {
  switch (type) {
    case 'daily_review':
    case 'overdue_review':
      return CHANNELS.REVIEWS;
    case 'streak':
      return CHANNELS.STREAKS;
    case 'achievement':
      return CHANNELS.ACHIEVEMENTS;
    case 'marketing':
      return CHANNELS.MARKETING;
    default:
      return CHANNELS.SYSTEM;
  }
}

export async function displayRichNotification(message: any) {
  const notifee = getNotifee();
  const enums = getNotifeeEnums();
  if (!notifee || !enums) return;
  const { AndroidStyle, AndroidCategory } = enums;

  try {
    const data = message.data || {};
    const notification = message.notification || {};
    
    const title = notification.title || data.title || 'PikaDecks';
    const body = notification.body || data.body || '';
    const type = data.type || 'system';
    
    const channelId = resolveChannel(type);

    const androidOptions: any = {
      channelId,
      smallIcon: 'ic_launcher_monochrome',
      largeIcon: require('../../assets/Pika/appIcon.png'),
      color: '#fdfaf2',
      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },
    };

    if (data.image_url) {
      androidOptions.style = {
        type: AndroidStyle.BIGPICTURE,
        picture: data.image_url,
      };
    }

    if (type === 'daily_review' || type === 'overdue_review') {
      androidOptions.actions = [
        {
          title: 'Review Now',
          pressAction: { id: 'review_now', launchActivity: 'default' },
        },
        {
          title: 'Snooze',
          pressAction: { id: 'snooze' },
        }
      ];
      androidOptions.category = AndroidCategory.REMINDER;
    }

    if (type === 'streak') {
      androidOptions.category = AndroidCategory.EVENT;
    }

    await notifee.displayNotification({
      id: message.messageId || data.idempotency_key || Math.random().toString(),
      title,
      body,
      data: data,
      android: androidOptions,
    });
  } catch (error) {
    captureException(error, { feature: 'notifee', action: 'display_notification' });
  }
}

/**
 * Handle notification interaction (press or action button press)
 */
export async function handleNotifeeEvent(
  event: Event, 
  getToken: () => Promise<string | null>, 
  router?: { push: (href: never) => void }
) {
  const enums = getNotifeeEnums();
  if (!enums) return;
  const { EventType } = enums;
  const { type, detail } = event;
  const { notification, pressAction } = detail;

  if (type === EventType.ACTION_PRESS && pressAction) {
    const actionId = pressAction.id;
    const notifee = getNotifee();
    const notificationData = normalizeNotificationData(notification?.data);
    
    await logNotificationAction(getToken, notificationData, actionId);
    
    if (pressAction.launchActivity && router) {
       const target = resolveTarget(notificationData);
       router.push(target as never);
    }
    
    if (notification?.id && !pressAction.launchActivity) {
      await notifee?.cancelNotification(notification.id);
    }
  }

  if (type === EventType.PRESS && notification) {
    const notificationData = normalizeNotificationData(notification?.data);
    
    await logNotificationOpened(getToken, notificationData);
    
    if (router) {
       const target = resolveTarget(notificationData);
       router.push(target as never);
    }
  }
}

function resolveTarget(data: Record<string, string | undefined>) {
  const type = data?.type;
  const target = data?.target;

  if (target) return target;
  if (type === 'daily_review' || type === 'overdue_review') return '/review/start';
  if (type === 'achievement' || type === 'streak') return '/stats';
  return '/home';
}

function normalizeNotificationData(data?: Record<string, unknown>): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(data || {})) {
    if (typeof value === 'string') {
      normalized[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      normalized[key] = String(value);
    }
  }

  return normalized;
}

async function logNotificationAction(
  getToken: () => Promise<string | null>, 
  data: Record<string, string | undefined>,
  actionId: string
) {
  try {
    const idempotencyKey = data.idempotency_key;
    if (!idempotencyKey) return;
    
    await sendOrQueueNotificationEvent(getToken, {
      path: '/notifications/action',
      body: {
        idempotency_key: idempotencyKey,
        action: actionId,
        notification_type: data.type,
      },
    });
  } catch (error) {
    captureException(error, { feature: 'notifee', action: 'log_action' });
  }
}

async function logNotificationOpened(
  getToken: () => Promise<string | null>, 
  data: Record<string, string | undefined>
) {
  try {
    const idempotencyKey = data.idempotency_key;
    if (!idempotencyKey) return;
    
    await sendOrQueueNotificationEvent(getToken, {
      path: '/notifications/opened',
      body: {
        idempotency_key: idempotencyKey,
        notification_type: data.type,
      },
    });
  } catch (error) {
    captureException(error, { feature: 'notifee', action: 'log_opened' });
  }
}

// Background event handler (needs to be registered outside component lifecycle)
export function registerBackgroundNotifeeHandler(getToken: () => Promise<string | null>) {
  const notifee = getNotifee();
  if (!notifee) return;
  notifee.onBackgroundEvent(async (event) => {
    // For background events we likely don't have router, so we just log the action
    await handleNotifeeEvent(event, getToken);
  });
}
