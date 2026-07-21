import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_REVIEWS_KEY = 'pikadecks:pending-reviews';

export type PendingReview = {
  id: string;
  deck_id: string;
  card_id: string;
  rating: string;
  reviewed_at: string;
};

async function readPendingReviews(): Promise<PendingReview[]> {
  const raw = await AsyncStorage.getItem(PENDING_REVIEWS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePendingReviews(reviews: PendingReview[]) {
  await AsyncStorage.setItem(PENDING_REVIEWS_KEY, JSON.stringify(reviews));
}

export async function enqueuePendingReview(review: Omit<PendingReview, 'id' | 'reviewed_at'>) {
  const pending = await readPendingReviews();
  pending.push({
    ...review,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    reviewed_at: new Date().toISOString(),
  });
  await writePendingReviews(pending);
}

export async function syncPendingReviews(getToken: () => Promise<string | null>) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return;

  const token = await getToken();
  if (!token) return;

  const pending = await readPendingReviews();
  if (pending.length === 0) return;

  const remaining: PendingReview[] = [];

  for (const review of pending) {
    try {
      const response = await fetch(`${apiUrl}/reviews/${review.card_id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deck_id: review.deck_id,
          rating: review.rating,
          reviewed_at: review.reviewed_at,
        }),
      });

      if (!response.ok) remaining.push(review);
    } catch {
      remaining.push(review);
    }
  }

  await writePendingReviews(remaining);
}
