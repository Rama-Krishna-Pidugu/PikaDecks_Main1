import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_AUTH_KEY = 'pikadecks:last-authenticated-user';

export type OfflineAuthUser = {
  userId: string;
  savedAt: number;
};

export async function saveOfflineAuthUser(userId: string) {
  const snapshot: OfflineAuthUser = {
    userId,
    savedAt: Date.now(),
  };

  await AsyncStorage.setItem(OFFLINE_AUTH_KEY, JSON.stringify(snapshot));
}

export async function getOfflineAuthUser(): Promise<OfflineAuthUser | null> {
  const raw = await AsyncStorage.getItem(OFFLINE_AUTH_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OfflineAuthUser>;
    return typeof parsed.userId === 'string'
      ? { userId: parsed.userId, savedAt: Number(parsed.savedAt) || 0 }
      : null;
  } catch {
    return null;
  }
}

export async function clearOfflineAuthUser() {
  await AsyncStorage.removeItem(OFFLINE_AUTH_KEY);
}

export function useOfflineAuthUser() {
  const [offlineUser, setOfflineUser] = useState<OfflineAuthUser | null>(null);
  const [isOfflineAuthLoaded, setIsOfflineAuthLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    getOfflineAuthUser()
      .then((user) => {
        if (mounted) setOfflineUser(user);
      })
      .finally(() => {
        if (mounted) setIsOfflineAuthLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return {
    offlineUser,
    offlineUserId: offlineUser?.userId ?? null,
    isOfflineAuthLoaded,
    setOfflineUser,
  };
}
