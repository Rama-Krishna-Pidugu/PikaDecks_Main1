/**
 * Centralized TanStack Query hooks for the entire PikaDecks web app.
 *
 * Every domain (decks, stats, billing, user-sync, upload-usage, deck-detail,
 * cards, reviews) lives here so that:
 *   - Query keys are consistent and type-safe
 *   - Stale times are tuned per-domain
 *   - Cache is shared across pages automatically
 *   - Mutations invalidate the correct queries
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useAuth } from "@clerk/tanstack-react-start";
import { apiFetch, syncUser as syncBackendUser } from "@/lib/api";

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const queryKeys = {
  syncUser: ["sync-user"] as const,
  subscriptionStatus: ["subscription-status"] as const,
  decks: ["decks"] as const,
  stats: ["stats"] as const,
  uploadUsage: ["upload-usage"] as const,
  billingPlans: ["billing-plans"] as const,
  billingHistory: ["billing-history"] as const,
  deckDetail: (deckId: string) => ["deck-detail", deckId] as const,
  deckCards: (deckId: string) => ["deck-cards", deckId] as const,
  reviewSession: (deckId: string) => ["review-session", deckId] as const,
  studyStats: ["study-stats"] as const,
  studyStreak: ["study-streak"] as const,
  reviewProgress: ["review-progress"] as const,
} as const;

// ---------------------------------------------------------------------------
// Stale Times  (milliseconds)
// ---------------------------------------------------------------------------

export const staleTimes = {
  syncUser: 5 * 60 * 1000,          // 5 min  — rarely changes
  subscriptionStatus: 5 * 60 * 1000, // 5 min  — rarely changes
  decks: 30 * 1000,                  // 30 sec — may change after create/delete
  stats: 2 * 60 * 1000,             // 2 min  — changes after reviews
  deckDetail: 30 * 1000,            // 30 sec
  deckCards: 30 * 1000,             // 30 sec
  uploadUsage: 60 * 1000,           // 1 min
  billingPlans: 10 * 60 * 1000,     // 10 min — almost never changes
  reviewSession: 0,                  // always fresh — unique per review start
  studyStats: 10 * 1000,             // 10 sec
  studyStreak: 10 * 1000,            // 10 sec
  reviewProgress: 10 * 1000,          // 10 sec
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Deck = {
  deck_id: string;
  title: string;
  description?: string | null;
};

export type Card = {
  card_id: string;
  question: string;
  answer: string;
  explanation?: string | null;
  image_url?: string | null;
  notes_image_url?: string | null;
};

export type StatsResponse = {
  current_streak: number;
  longest_streak: number;
  cards_reviewed_total: number;
  study_days: number;
  cards_reviewed_today: number;
  weekly: number[];
  due_today?: number;
  overdue?: number;
  upcoming_reviews?: number;
  cards_learned?: number;
  reviews_today?: number;
  total_reviews?: number;
  average_retention?: number;
  decks_breakdown?: Record<string, {
    deck_id: string;
    due: number;
    overdue: number;
    new: number;
    total: number;
  }>;
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
  current_streak: number;
  longest_streak: number;
  total_study_days: number;
  streak_freeze_count: number;
  streak_freeze_active: boolean;
  milestones: StreakMilestone[];
};

export type ReviewProgress = {
  reviews_due_today: number;
  reviews_completed_today: number;
  remaining_reviews: number;
  completion_percentage: number;
};

export type SubscriptionStatus = {
  is_pro: boolean;
  plan: "free" | "pro";
  subscription?: {
    id?: string;
    product_id?: string;
    status?: string;
    expires_at?: string;
    platform?: string;
    auto_renewing?: boolean;
    purchase_date?: string;
    created_at?: string;
  } | null;
};

export type UploadUsage = {
  remaining: number | null;
  limit: number | null;
  unlimited?: boolean;
};

export type SyncUserResponse = {
  success?: boolean;
  restored?: boolean;
  user?: {
    scheduled_deletion_at?: string | null;
    [key: string]: unknown;
  };
};

// ---------------------------------------------------------------------------
// Query Hooks
// ---------------------------------------------------------------------------

/**
 * Sync the current Clerk user with the PikaDecks backend.
 * Returns user metadata including `scheduled_deletion_at`.
 */
export function useSyncUser() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery<SyncUserResponse>({
    queryKey: queryKeys.syncUser,
    queryFn: () => syncBackendUser(getToken) as Promise<SyncUserResponse>,
    staleTime: staleTimes.syncUser,
    enabled: !!isSignedIn,
  });
}

/**
 * Subscription status (is_pro, plan details, expiry).
 * Shared across dashboard layout, profile, and billing pages.
 */
export function useSubscriptionStatus() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery<SubscriptionStatus>({
    queryKey: queryKeys.subscriptionStatus,
    queryFn: () =>
      apiFetch<SubscriptionStatus>("/billing/subscription-status", {
        method: "POST",
        getToken,
      }),
    staleTime: staleTimes.subscriptionStatus,
    enabled: !!isSignedIn,
  });
}

/**
 * All decks for the current user.
 * Shared across dashboard home and decks catalog.
 */
export function useDecks() {
  const { getToken } = useAuth();
  return useQuery<Deck[]>({
    queryKey: queryKeys.decks,
    queryFn: async () => {
      const data = await apiFetch<{ decks?: Deck[] }>("/decks", { getToken });
      return Array.isArray(data?.decks) ? data.decks : [];
    },
    staleTime: staleTimes.decks,
  });
}

/**
 * User study stats (streaks, cards reviewed, weekly activity).
 * Shared across dashboard home and stats page.
 */
export function useStats() {
  const { getToken } = useAuth();
  return useQuery<StatsResponse>({
    queryKey: queryKeys.stats,
    queryFn: async () => {
      const data = await apiFetch<Partial<StatsResponse>>("/stats", {
        getToken,
      });
      return {
        current_streak: data?.current_streak || 0,
        longest_streak: data?.longest_streak || 0,
        cards_reviewed_total: data?.cards_reviewed_total || 0,
        study_days: data?.study_days || 0,
        cards_reviewed_today: data?.cards_reviewed_today || 0,
        weekly:
          Array.isArray(data?.weekly) && data.weekly.length === 7
            ? data.weekly
            : [0, 0, 0, 0, 0, 0, 0],
        due_today: data?.due_today || 0,
        overdue: data?.overdue || 0,
        upcoming_reviews: data?.upcoming_reviews || 0,
        cards_learned: data?.cards_learned || 0,
        reviews_today: data?.reviews_today || 0,
        total_reviews: data?.total_reviews || 0,
        average_retention: data?.average_retention || 0,
        decks_breakdown: data?.decks_breakdown || {},
      };
    },
    staleTime: staleTimes.stats,
  });
}

/**
 * Upload/generation usage quota.
 * Shared across upload, create-youtube, and create-notes pages.
 */
export function useUploadUsage() {
  const { getToken } = useAuth();
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return useQuery<UploadUsage | null>({
    queryKey: queryKeys.uploadUsage,
    queryFn: async () => {
      const data = await apiFetch<{ usage?: UploadUsage }>(
        `/uploads/usage?timezone=${encodeURIComponent(timezone)}`,
        { getToken },
      );
      return data.usage ?? null;
    },
    staleTime: staleTimes.uploadUsage,
  });
}

/**
 * Billing plans (prices for weekly/monthly/yearly).
 */
export function useBillingPlans() {
  const { getToken } = useAuth();
  return useQuery<Record<string, { amount: number; currency: string }> | null>({
    queryKey: queryKeys.billingPlans,
    queryFn: async () => {
      try {
        return await apiFetch<
          Record<string, { amount: number; currency: string }>
        >("/billing/plans", { method: "GET", getToken });
      } catch {
        return null;
      }
    },
    staleTime: staleTimes.billingPlans,
  });
}

/**
 * Single deck metadata.
 */
export function useDeckDetail(deckId: string) {
  const { getToken } = useAuth();
  const isMultiple = deckId.includes(",");
  return useQuery<Deck | null>({
    queryKey: queryKeys.deckDetail(deckId),
    queryFn: async () => {
      if (isMultiple) {
        return {
          deck_id: deckId,
          title: "Multi-Deck Review Session",
          description: "Reviewing cards across multiple selected decks.",
          user_id: "",
          created_at: new Date().toISOString(),
        } as any;
      }
      const data = await apiFetch<{ deck?: Deck }>(`/decks/${deckId}`, {
        getToken,
      });
      return data?.deck || null;
    },
    staleTime: staleTimes.deckDetail,
    enabled: !!deckId,
  });
}

/**
 * Cards belonging to a specific deck.
 */
export function useDeckCards(deckId: string) {
  const { getToken } = useAuth();
  return useQuery<Card[]>({
    queryKey: queryKeys.deckCards(deckId),
    queryFn: async () => {
      const data = await apiFetch<{ cards?: Card[] }>(
        `/decks/${deckId}/cards`,
        { getToken },
      );
      return Array.isArray(data?.cards) ? data.cards : [];
    },
    staleTime: staleTimes.deckCards,
    enabled: !!deckId && !deckId.includes(","),
  });
}

/**
 * Review session cards for a deck (limited set of due cards).
 */
export function useReviewSession(deckId: string, limit?: number, order?: string) {
  const { getToken } = useAuth();
  return useQuery<Card[]>({
    queryKey: ["review-session", deckId, limit, order],
    queryFn: async () => {
      const limitParam = limit ? `&limit=${limit}` : "&limit=20";
      const data = await apiFetch<{ cards?: Card[] }>(
        `/reviews/session?deck_id=${encodeURIComponent(deckId)}${limitParam}`,
        { getToken },
      );
      let loaded = Array.isArray(data?.cards) ? data.cards : [];
      if (order === "sequential" && deckId) {
        const deckIdList = deckId.split(",");
        loaded = [...loaded].sort((a, b) => {
          const idxA = deckIdList.indexOf(a.deck_id || "");
          const idxB = deckIdList.indexOf(b.deck_id || "");
          if (idxA !== idxB) {
            return idxA - idxB;
          }
          return 0;
        });
      }
      return loaded;
    },
    staleTime: staleTimes.reviewSession,
    enabled: !!deckId,
  });
}

// ---------------------------------------------------------------------------
// Mutation Hooks
// ---------------------------------------------------------------------------

/**
 * Create a new deck. Invalidates the decks list on success.
 */
export function useCreateDeck() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["create-deck"],
    mutationFn: (input: { title: string; description?: string }) =>
      apiFetch("/decks", {
        method: "POST",
        getToken,
        bodyJson: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
    },
  });
}

/**
 * Delete a deck. Invalidates the decks list on success.
 */
export function useDeleteDeck() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["delete-deck"],
    mutationFn: (deckId: string) =>
      apiFetch(`/decks/${deckId}`, { method: "DELETE", getToken }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
    },
  });
}

/**
 * Update a deck (title/description). Invalidates specific deck detail and decks list.
 */
export function useUpdateDeck(deckId: string) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["update-deck", deckId],
    mutationFn: (input: { title: string; description?: string }) =>
      apiFetch(`/decks/${deckId}`, {
        method: "PATCH",
        getToken,
        bodyJson: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.deckDetail(deckId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
    },
  });
}


/**
 * Create a card inside a deck. Invalidates deck cards on success.
 */
export function useCreateCard(deckId: string) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["create-card", deckId],
    mutationFn: (input: {
      question: string;
      answer: string;
      explanation?: string | null;
      image_url?: string | null;
      notes_image_url?: string | null;
    }) =>
      apiFetch(`/decks/${deckId}/cards`, {
        method: "POST",
        getToken,
        bodyJson: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.deckCards(deckId),
      });
    },
  });
}

/**
 * Update a card. Invalidates deck cards on success.
 */
export function useUpdateCard(deckId: string) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["update-card", deckId],
    mutationFn: (input: {
      cardId: string;
      question: string;
      answer: string;
      explanation?: string | null;
      image_url?: string | null;
      notes_image_url?: string | null;
    }) =>
      apiFetch(`/decks/${deckId}/cards/${input.cardId}`, {
        method: "PUT",
        getToken,
        bodyJson: {
          question: input.question,
          answer: input.answer,
          explanation: input.explanation,
          image_url: input.image_url,
          notes_image_url: input.notes_image_url,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.deckCards(deckId),
      });
    },
  });
}

/**
 * Delete a card. Invalidates deck cards on success.
 */
export function useDeleteCard(deckId: string) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["delete-card", deckId],
    mutationFn: (cardId: string) =>
      apiFetch(`/decks/${deckId}/cards/${cardId}`, {
        method: "DELETE",
        getToken,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.deckCards(deckId),
      });
    },
  });
}

/**
 * Submit a review rating for a card. Fire-and-forget pattern.
 * Invalidates stats after success (streaks may change).
 */
export function useSubmitReview() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["submit-review"],
    mutationFn: (input: {
      cardId: string;
      deckId: string;
      rating: string;
    }) =>
      apiFetch(`/reviews/${input.cardId}`, {
        method: "POST",
        getToken,
        bodyJson: {
          deck_id: input.deckId,
          rating: input.rating,
        },
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      void queryClient.invalidateQueries({ queryKey: queryKeys.studyStats });
      void queryClient.invalidateQueries({ queryKey: queryKeys.studyStreak });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviewProgress });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviewSession(variables.deckId) });
    },
  });
}

/**
 * Subscription history for the current user.
 */
export function useBillingHistory() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery<{ history: any[] }>({
    queryKey: queryKeys.billingHistory,
    queryFn: () =>
      apiFetch<{ history: any[] }>("/billing/history", {
        method: "GET",
        getToken,
      }),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to prevent duplicate network requests
    enabled: !!isSignedIn,
  });
}

/**
 * Detailed study stats from /study/stats.
 */
export function useStudyStats() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery<StudyStats>({
    queryKey: queryKeys.studyStats,
    queryFn: () =>
      apiFetch<StudyStats>("/study/stats", {
        method: "GET",
        getToken,
      }),
    staleTime: staleTimes.studyStats,
    enabled: !!isSignedIn,
  });
}

/**
 * Study streak metrics including milestones.
 */
export function useStudyStreak() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery<StudyStreak>({
    queryKey: queryKeys.studyStreak,
    queryFn: () =>
      apiFetch<StudyStreak>("/study/streak", {
        method: "GET",
        getToken,
      }),
    staleTime: staleTimes.studyStreak,
    enabled: !!isSignedIn,
  });
}

/**
 * Review progress of the day (completed/due count).
 */
export function useReviewProgress() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery<ReviewProgress>({
    queryKey: queryKeys.reviewProgress,
    queryFn: () =>
      apiFetch<ReviewProgress>("/study/review-progress", {
        method: "GET",
        getToken,
      }),
    staleTime: staleTimes.reviewProgress,
    enabled: !!isSignedIn,
  });
}

/**
 * Activate a streak freeze.
 */
export function useUseStreakFreeze() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ message?: string }>("/study/streak/freeze", {
        method: "POST",
        getToken,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studyStreak });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

