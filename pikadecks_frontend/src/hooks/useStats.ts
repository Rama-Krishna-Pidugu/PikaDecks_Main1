import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-expo';
import { readJsonResponse } from '@/lib/api-debug';
import { useOfflineAuthUser } from '@/lib/offline-auth';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export type UserStats = {
  current_streak: number;
  longest_streak: number;
  cards_reviewed_today: number;
  cards_reviewed_total: number;
  due_today: number;
  overdue: number;
  upcoming_reviews: number;
  cards_learned: number;
  reviews_today: number;
  total_reviews: number;
  average_retention: number;
  study_days: number;
  weekly: number[];
};

export type StudyStats = {
  current_streak: number;
  longest_streak: number;
  total_study_days: number;
  cards_reviewed: number;
  hours_studied: number;
};

export type StreakMilestone = {
  days: number;
  reached: boolean;
  name: string;
};

export type StudyStreak = {
  state: 'ACTIVE' | 'FROZEN' | 'BROKEN';
  status?: 'ACTIVE' | 'FROZEN' | 'BROKEN';
  current_streak: number;
  longest_streak: number;
  total_study_days: number;
  restore_tokens: number;
  restore_tokens_earned?: number;
  monthly_restores_remaining?: number;
  monthly_restore_limit?: number | null;
  shields_remaining?: number | null;
  shield_limit?: number | null;
  can_restore?: boolean;
  can_use_shield?: boolean;
  last_study_date: string | null;
  last_qualified_study_at?: string | null;
  grace_period_ends: string | null;
  freeze_started_at?: string | null;
  freeze_expires_at?: string | null;
  seconds_until_expiry?: number | null;
  protected_streak_value?: number;
  daily_goal?: {
    cards_required: number;
    minutes_required: number;
    mode: 'cards_or_minutes' | 'cards_and_minutes';
  };
  milestones: StreakMilestone[];
};

export type ReviewProgress = {
  reviews_due_today: number;
  reviews_completed_today: number;
  remaining_reviews: number;
  completion_percentage: number;
};

export const EMPTY_STATS: UserStats = {
  current_streak: 0,
  longest_streak: 0,
  cards_reviewed_today: 0,
  cards_reviewed_total: 0,
  due_today: 0,
  overdue: 0,
  upcoming_reviews: 0,
  cards_learned: 0,
  reviews_today: 0,
  total_reviews: 0,
  average_retention: 0,
  study_days: 0,
  weekly: [0, 0, 0, 0, 0, 0, 0],
};

export function useStats() {
  const { userId, getToken, isSignedIn } = useAuth();
  const { offlineUserId } = useOfflineAuthUser();
  const { isOnline } = useNetworkStatus();
  const effectiveUserId = userId ?? offlineUserId;
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['stats', effectiveUserId],
    queryFn: async (): Promise<UserStats> => {
      if (!isOnline) {
        const cached = queryClient.getQueryData<UserStats>(['stats', effectiveUserId]);
        return cached || EMPTY_STATS;
      }
      try {
        const token = await getToken();
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!token || !apiUrl) {
          const cached = queryClient.getQueryData<UserStats>(['stats', effectiveUserId]);
          return cached || EMPTY_STATS;
        }
        const response = await fetch(`${apiUrl}/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
          const cached = queryClient.getQueryData<UserStats>(['stats', effectiveUserId]);
          return cached || EMPTY_STATS;
        }
        const data = await readJsonResponse(response);
        return { ...EMPTY_STATS, ...(data || {}) };
      } catch {
        const cached = queryClient.getQueryData<UserStats>(['stats', effectiveUserId]);
        return cached || EMPTY_STATS;
      }
    },
    enabled: (isSignedIn && isOnline && !!userId) || (!isOnline && !!offlineUserId),
    staleTime: 2 * 60 * 1000,
  });
}

// ── Study Stats ──
export function useStudyStats() {
  const { userId, getToken, isSignedIn } = useAuth();
  const { offlineUserId } = useOfflineAuthUser();
  const { isOnline } = useNetworkStatus();
  const effectiveUserId = userId ?? offlineUserId;
  const queryClient = useQueryClient();

  const emptyStudyStats: StudyStats = {
    current_streak: 0,
    longest_streak: 0,
    total_study_days: 0,
    cards_reviewed: 0,
    hours_studied: 0,
  };

  return useQuery<StudyStats>({
    queryKey: ['study-stats', effectiveUserId],
    queryFn: async () => {
      if (!isOnline) {
        const cached = queryClient.getQueryData<StudyStats>(['study-stats', effectiveUserId]);
        return cached || emptyStudyStats;
      }
      try {
        const token = await getToken();
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!token || !apiUrl) {
          const cached = queryClient.getQueryData<StudyStats>(['study-stats', effectiveUserId]);
          return cached || emptyStudyStats;
        }
        const res = await fetch(`${apiUrl}/study/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const cached = queryClient.getQueryData<StudyStats>(['study-stats', effectiveUserId]);
          return cached || emptyStudyStats;
        }
        return await readJsonResponse(res);
      } catch {
        const cached = queryClient.getQueryData<StudyStats>(['study-stats', effectiveUserId]);
        return cached || emptyStudyStats;
      }
    },
    enabled: (isSignedIn && isOnline && !!userId) || (!isOnline && !!offlineUserId),
    staleTime: 10 * 1000,
  });
}

// ── Study Streak ──
export function useStudyStreak() {
  const { userId, getToken, isSignedIn } = useAuth();
  const { offlineUserId } = useOfflineAuthUser();
  const { isOnline } = useNetworkStatus();
  const effectiveUserId = userId ?? offlineUserId;
  const queryClient = useQueryClient();

  const emptyStreak: StudyStreak = {
    state: 'BROKEN',
    current_streak: 0,
    longest_streak: 0,
    total_study_days: 0,
    restore_tokens: 0,
    last_study_date: null,
    grace_period_ends: null,
    milestones: [],
  };

  return useQuery<StudyStreak>({
    queryKey: ['study-streak', effectiveUserId],
    queryFn: async () => {
      if (!isOnline) {
        const cached = queryClient.getQueryData<StudyStreak>(['study-streak', effectiveUserId]);
        return cached || emptyStreak;
      }
      try {
        const token = await getToken();
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!token || !apiUrl) {
          const cached = queryClient.getQueryData<StudyStreak>(['study-streak', effectiveUserId]);
          return cached || emptyStreak;
        }
        const res = await fetch(`${apiUrl}/study/streak`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const cached = queryClient.getQueryData<StudyStreak>(['study-streak', effectiveUserId]);
          return cached || emptyStreak;
        }
        return await readJsonResponse(res);
      } catch {
        const cached = queryClient.getQueryData<StudyStreak>(['study-streak', effectiveUserId]);
        return cached || emptyStreak;
      }
    },
    enabled: (isSignedIn && isOnline && !!userId) || (!isOnline && !!offlineUserId),
    staleTime: 10 * 1000,
  });
}

// ── Review Progress ──
export function useReviewProgress() {
  const { userId, getToken, isSignedIn } = useAuth();
  const { offlineUserId } = useOfflineAuthUser();
  const { isOnline } = useNetworkStatus();
  const effectiveUserId = userId ?? offlineUserId;
  const queryClient = useQueryClient();

  const emptyProgress: ReviewProgress = {
    reviews_due_today: 0,
    reviews_completed_today: 0,
    remaining_reviews: 0,
    completion_percentage: 0,
  };

  return useQuery<ReviewProgress>({
    queryKey: ['review-progress', effectiveUserId],
    queryFn: async () => {
      if (!isOnline) {
        const cached = queryClient.getQueryData<ReviewProgress>(['review-progress', effectiveUserId]);
        return cached || emptyProgress;
      }
      try {
        const token = await getToken();
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!token || !apiUrl) {
          const cached = queryClient.getQueryData<ReviewProgress>(['review-progress', effectiveUserId]);
          return cached || emptyProgress;
        }
        const res = await fetch(`${apiUrl}/study/review-progress`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const cached = queryClient.getQueryData<ReviewProgress>(['review-progress', effectiveUserId]);
          return cached || emptyProgress;
        }
        return await readJsonResponse(res);
      } catch {
        const cached = queryClient.getQueryData<ReviewProgress>(['review-progress', effectiveUserId]);
        return cached || emptyProgress;
      }
    },
    enabled: (isSignedIn && isOnline && !!userId) || (!isOnline && !!offlineUserId),
    staleTime: 10 * 1000,
  });
}

// ── Use Streak Freeze ──
export function useRestoreStreak() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const { offlineUserId } = useOfflineAuthUser();
  const effectiveUserId = userId ?? offlineUserId;

  return useMutation({
    mutationFn: async (variables?: { retroactive: boolean }) => {
      const token = await getToken();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!token || !apiUrl) {
        throw new Error('Not authenticated');
      }
      const res = await fetch(`${apiUrl}/study/streak/restore`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `streak-restore-${Date.now()}`,
        },
        body: JSON.stringify({ retroactive: variables?.retroactive ?? false }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) {
        let msg = 'Failed to restore streak';
        if (typeof data === 'string') msg = data;
        else if (data?.detail && typeof data.detail === 'string') msg = data.detail;
        else if (data?.message && typeof data.message === 'string') msg = data.message;
        else if (data?.detail && Array.isArray(data.detail)) msg = data.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
        else if (typeof data === 'object' && data !== null) msg = JSON.stringify(data);
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['study-streak', effectiveUserId] });
      void queryClient.invalidateQueries({ queryKey: ['stats', effectiveUserId] });
    },
  });
}

export const useUseStreakFreeze = useRestoreStreak;
