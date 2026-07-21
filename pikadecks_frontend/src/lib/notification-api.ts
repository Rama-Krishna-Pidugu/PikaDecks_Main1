import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PUSH_DEVICE_ID_KEY = 'pikadecks:push-device-id';

export async function getPushDeviceId() {
  const existing = await AsyncStorage.getItem(PUSH_DEVICE_ID_KEY);
  if (existing) return existing;

  const id = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(PUSH_DEVICE_ID_KEY, id);
  return id;
}

export async function callNotificationApi(
  path: string,
  clerkToken: string,
  body: Record<string, unknown>,
  method = 'POST',
) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_URL');
  }

  const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${clerkToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Notification function failed: ${response.status}`);
  }
}
