import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  ScrollView,
  Platform,
  Image,
  Vibration,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { colors, shadows, radius } from '@/constants/theme';
import { readJsonResponse } from '@/lib/api-debug';
import { pikaAssets } from '@/constants/assets';
import { useDecks } from '@/hooks/useDecks';
import { analyticsEvents } from '@/lib/firebase';
import { addBreadcrumb, captureException } from '@/lib/errors';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useOfflineAuthUser } from '@/lib/offline-auth';
import { enqueuePendingReview } from '@/lib/offline-review-queue';
import { FlashcardContentRenderer } from '@/components/flashcard-content-renderer';
import { ImageRefreshService } from '@/services/ImageRefreshService';

const { width: SCREEN_W } = Dimensions.get('window');

type Card = {
  card_id: string;
  deck_id?: string;
  question: string;
  answer: string;
  explanation?: string | null;
  image_url?: string | null;
  notes_image_url?: string | null;
  review?: {
    learning_state?: 'new' | 'learning' | 'review' | 'relearning';
    next_review_at?: string | null;
    interval_days?: number;
  };
};

type Deck = {
  deck_id: string;
  title: string;
  description?: string | null;
};

const EMOJIS = ['📚', '🧬', '🏛️', '⚛️', '🌍', '🎨', '🔬', '💡'];
function deckEmoji(i: number) { return EMOJIS[i % EMOJIS.length]; }

const saveSession = async (deckId: string, idx: number, cardList: Card[]) => {
  try {
    const progressKey = `deck_progress_${deckId}`;
    const cardsKey = `deck_cards_${deckId}`;
    if (Platform.OS === 'web') {
      localStorage.setItem(progressKey, String(idx));
      localStorage.setItem(cardsKey, JSON.stringify(cardList));
    } else {
      await AsyncStorage.setItem(progressKey, String(idx));
      await AsyncStorage.setItem(cardsKey, JSON.stringify(cardList));
    }
  } catch (e) {}
};

const getSession = async (deckId: string): Promise<{ idx: number; cardList: Card[] | null }> => {
  try {
    const progressKey = `deck_progress_${deckId}`;
    const cardsKey = `deck_cards_${deckId}`;
    let idxVal: string | null = null;
    let cardsVal: string | null = null;
    if (Platform.OS === 'web') {
      idxVal = localStorage.getItem(progressKey);
      cardsVal = localStorage.getItem(cardsKey);
    } else {
      idxVal = await AsyncStorage.getItem(progressKey);
      cardsVal = await AsyncStorage.getItem(cardsKey);
    }
    const idx = idxVal ? parseInt(idxVal, 10) : 0;
    const cardList = cardsVal ? JSON.parse(cardsVal) : null;
    return { idx, cardList };
  } catch {
    return { idx: 0, cardList: null };
  }
};

const clearSession = async (deckId: string) => {
  try {
    const progressKey = `deck_progress_${deckId}`;
    const cardsKey = `deck_cards_${deckId}`;
    if (Platform.OS === 'web') {
      localStorage.removeItem(progressKey);
      localStorage.removeItem(cardsKey);
    } else {
      await AsyncStorage.removeItem(progressKey);
      await AsyncStorage.removeItem(cardsKey);
    }
  } catch {}
};

const RATINGS = [
  { key: 'again', label: 'Forgot', color: '#EF4444', bg: 'rgba(239,68,68,0.03)', shakeAmt: 6, haptic: 'heavy' },
  { key: 'hard',  label: 'Hard',   color: '#F59E0B', bg: 'rgba(245,158,11,0.03)', shakeAmt: 3, haptic: 'medium' },
  { key: 'good',  label: 'Medium', color: '#3B82F6', bg: 'rgba(59,130,246,0.03)', shakeAmt: 0, haptic: 'light' },
  { key: 'easy',  label: 'Easy',   color: '#3DBC8C', bg: 'rgba(61,188,140,0.03)', shakeAmt: 0, haptic: 'selection' },
];

const RatingButton = React.memo(({
  rating,
  disabled,
  onPressStart,
  onPressEnd,
}: {
  rating: typeof RATINGS[0];
  disabled: boolean;
  onPressStart: () => void;
  onPressEnd: () => void;
}) => {
  const shakeX = useRef(new Animated.Value(0)).current;
  const activeProgress = useRef(new Animated.Value(0)).current;
  const [isActive, setIsActive] = useState(false);

  const handlePress = () => {
    if (disabled) return;

    // 1. Tactile Haptic Vibration based on rating intensity
    if (rating.haptic === 'heavy') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      Vibration.vibrate(100);
    } else if (rating.haptic === 'medium') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Vibration.vibrate(60);
    } else if (rating.haptic === 'light') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Vibration.vibrate(30);
    } else if (rating.haptic === 'selection') {
      void Haptics.selectionAsync();
      Vibration.vibrate(15);
    }

    // Disable all buttons immediately
    onPressStart();
    setIsActive(true);

    // 2. Horizontal Shake animation based on rating intensity
    if (rating.shakeAmt > 0) {
      Animated.sequence([
        Animated.timing(shakeX, { toValue: rating.shakeAmt, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -rating.shakeAmt, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: rating.shakeAmt * 0.75, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -rating.shakeAmt * 0.75, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: rating.shakeAmt * 0.5, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -rating.shakeAmt * 0.5, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 0, duration: 80, useNativeDriver: true }),
      ]).start();
    }

    // 3. Color Transition: background -> difficulty color
    Animated.timing(activeProgress, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();

    // 4. Return Animation: hold briefly, then smoothly return and trigger submission
    setTimeout(() => {
      Animated.timing(activeProgress, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start(() => {
        setIsActive(false);
        onPressEnd();
      });
    }, 500);
  };

  const backgroundColor = activeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [rating.bg, rating.color],
  });

  const textColor = isActive ? '#FFFFFF' : rating.color;

  return (
    <Animated.View style={{ transform: [{ translateX: shakeX }], flex: 1 }}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handlePress}
        disabled={disabled}
        style={{ width: '100%' }}
      >
        <Animated.View style={[
          styles.ratingBtn, 
          { 
            backgroundColor, 
            borderColor: rating.color, 
            borderWidth: 1.5,
            marginHorizontal: 0 
          }
        ]}>
          <Text style={[styles.ratingLabel, { color: textColor }]}>
            {rating.label}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const FlashcardItem = React.memo(({ 
  card, 
  cardIndex, 
  onRate,
  onImagePress,
  onImageError
}: { 
  card: Card, 
  cardIndex: number, 
  onRate: (rating: string, cardId: string, idx: number) => void,
  onImagePress?: (url: string) => void,
  onImageError?: (url: string) => void
}) => {
  const [flipped, setFlipped] = useState(false);
  const [ratingDisabled, setRatingDisabled] = useState(false);
  
  const flipAnim = useRef(new Animated.Value(0)).current;
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const toggleFlip = () => {
    const nextFlipped = !flipped;
    setFlipped(nextFlipped);
    void Haptics.selectionAsync();

    flipAnim.stopAnimation(() => {
      Animated.spring(flipAnim, {
        toValue: nextFlipped ? 1 : 0,
        friction: 9,
        tension: 70,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleCardTouchStart = (event: any) => {
    touchStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
      time: Date.now(),
    };
  };

  const handleCardTouchEnd = (event: any) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const dx = Math.abs(event.nativeEvent.pageX - start.x);
    const dy = Math.abs(event.nativeEvent.pageY - start.y);
    const elapsed = Date.now() - start.time;

    if (dx < 8 && dy < 8 && elapsed < 500) {
      toggleFlip();
    }
  };

  const frontRotateY = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backRotateY = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const cardScale = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.035, 1],
  });

  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.49, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });

  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.51, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <View style={{ width: SCREEN_W, paddingHorizontal: 20 }}>
      <Text style={styles.tapHint}>
        {flipped ? 'Tap card to see question again' : 'Tap card to reveal answer'}
      </Text>
      
      <Animated.View style={[styles.cardOuter, { transform: [{ perspective: 1200 }, { scale: cardScale }] }]}>
        <View style={styles.cardTapTarget}>
          <Animated.View
            pointerEvents={flipped ? 'none' : 'auto'}
            style={[
              styles.cardFace,
              styles.cardSide,
              styles.cardFront,
              { zIndex: flipped ? 1 : 2, opacity: frontOpacity, transform: [{ perspective: 1200 }, { rotateY: frontRotateY }] },
            ]}
          >
            <ScrollView
              style={{ flex: 1 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cardFrontScrollContent}
              onTouchStart={handleCardTouchStart}
              onTouchEnd={handleCardTouchEnd}
            >
              <Text style={styles.sideLabel}>QUESTION</Text>
              <FlashcardContentRenderer 
                content={card.question}
                images={card.image_url ? [card.image_url] : []}
                color={colors.foreground}
                fontSize={24}
                style={{ width: '100%', justifyContent: 'center' }}
                textStyle={{ textAlign: 'center', fontWeight: '600', lineHeight: 32 }}
                onImagePress={onImagePress}
                onImageError={onImageError}
              />
              <View style={styles.flipHintRow}>
                <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                <Text style={styles.flipHintText}>Tap to reveal</Text>
              </View>
            </ScrollView>
          </Animated.View>

          <Animated.View
            pointerEvents={flipped ? 'auto' : 'none'}
            style={[
              styles.cardFace,
              styles.cardSide,
              styles.cardBack,
              { zIndex: flipped ? 2 : 1, opacity: backOpacity, transform: [{ perspective: 1200 }, { rotateY: backRotateY }] },
            ]}
          >
            <ScrollView
              style={{ flex: 1 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cardBackScrollContent}
              onTouchStart={handleCardTouchStart}
              onTouchEnd={handleCardTouchEnd}
            >
              <Text style={styles.sideLabel}>ANSWER</Text>
              <FlashcardContentRenderer
                content={card.answer}
                color={colors.foreground}
                fontSize={20}
                style={{ width: '100%', marginBottom: 20, justifyContent: 'center' }}
                textStyle={{ textAlign: 'center', fontWeight: '600', lineHeight: 30 }}
                onImagePress={onImagePress}
                onImageError={onImageError}
              />
              {(card.explanation || card.notes_image_url) ? (
                <>
                  <View style={styles.divider} />
                  <Text style={[styles.sideLabel, { marginTop: 4 }]}>EXPLANATION</Text>
                  <FlashcardContentRenderer
                    content={card.explanation || ''}
                    images={card.notes_image_url ? [card.notes_image_url] : []}
                    color={colors.mutedForeground}
                    fontSize={14}
                    style={{ width: '100%', marginBottom: 20, justifyContent: 'center' }}
                    textStyle={{ textAlign: 'center', lineHeight: 22 }}
                    onImagePress={onImagePress}
                    onImageError={onImageError}
                  />
                </>
              ) : null}
            </ScrollView>
          </Animated.View>
        </View>
      </Animated.View>

      {flipped ? (
        <View style={styles.ratingRow}>
          {RATINGS.map((r) => (
            <RatingButton
              key={r.key}
              rating={r}
              disabled={ratingDisabled}
              onPressStart={() => setRatingDisabled(true)}
              onPressEnd={() => {
                onRate(r.key, card.card_id, cardIndex);
                setRatingDisabled(false);
              }}
            />
          ))}
        </View>
      ) : (
        <View style={styles.ratingRow}>
          <View style={styles.ratingPlaceholder}>
            <Text style={styles.ratingPlaceholderText}>Reveal the answer first</Text>
          </View>
        </View>
      )}
    </View>
  );
});

export default function ReviewPage() {
  const { id, limit, order } = useLocalSearchParams<{ id: string; limit?: string; order?: string }>();
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { offlineUserId } = useOfflineAuthUser();
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const effectiveUserId = userId ?? offlineUserId;

  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number>(Date.now());
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedIndex, setSavedIndex] = useState(0);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    return () => {
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void queryClient.invalidateQueries({ queryKey: ['study-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['study-streak'] });
      void queryClient.invalidateQueries({ queryKey: ['review-progress'] });
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      if (id) {
        void queryClient.invalidateQueries({ queryKey: ['deck', id] });
      }
    };
  }, [id, queryClient]);

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const saved = id ? await getSession(id) : { idx: 0, cardList: null };

      if (id && effectiveUserId) {
        const deckIds = id.split(',');
        let allCachedCards: Card[] = [];
        let allFound = true;
        
        for (const dId of deckIds) {
          const cached = queryClient.getQueryData<{ cards?: Card[] }>(['deck', dId, effectiveUserId]);
          if (cached && Array.isArray(cached.cards)) {
            allCachedCards.push(...cached.cards);
          } else {
            allFound = false;
            break;
          }
        }
        
        if (allFound && allCachedCards.length > 0) {
          if (saved.idx > 0 && saved.cardList && saved.cardList.length === allCachedCards.length) {
            setSavedIndex(saved.idx);
            setCards(saved.cardList);
            setFetchedAt(Date.now());
            setShowResumePrompt(true);
            setLoading(false);
            return;
          }
          
          let sortedCards = [...allCachedCards];
          if (order === 'sequential') {
            sortedCards = sortedCards.sort((a, b) => {
              const idxA = deckIds.indexOf(a.deck_id || '');
              const idxB = deckIds.indexOf(b.deck_id || '');
              if (idxA !== idxB) return idxA - idxB;
              return 0;
            });
          } else {
            sortedCards = sortedCards.sort(() => Math.random() - 0.5);
          }
          
          setCards(sortedCards);
          setShowResumePrompt(false);
          void saveSession(id, 0, sortedCards);
          setLoading(false);
          return;
        }
      }

      if (!isOnline) {
        throw new Error('No cached cards available offline for this deck.');
      }

      const token = await getToken();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!token || !apiUrl) throw new Error('Missing API config');

      const sessionLimit = limit ? Math.min(parseInt(limit, 10), 200) : 50;
      const res = await fetch(`${apiUrl}/reviews/session?deck_id=${encodeURIComponent(id)}&limit=${sessionLimit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readJsonResponse(res);
      if (!res.ok) {
        let msg = 'Failed to load due cards';
        if (data?.detail && typeof data.detail === 'string') {
          msg = data.detail;
        } else if (data?.detail && Array.isArray(data.detail)) {
          msg = data.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
        } else if (data?.detail) {
          msg = JSON.stringify(data.detail);
        }
        throw new Error(msg);
      }

      let loaded = Array.isArray(data?.cards) ? data.cards : [];
      if (order === 'sequential' && id) {
        const deckIdList = id.split(',');
        loaded = [...loaded].sort((a, b) => {
          const idxA = deckIdList.indexOf(a.deck_id || '');
          const idxB = deckIdList.indexOf(b.deck_id || '');
          if (idxA !== idxB) {
            return idxA - idxB;
          }
          return 0;
        });
      } else {
        loaded = [...loaded].sort(() => Math.random() - 0.5);
      }

      if (saved.idx > 0 && saved.cardList && saved.cardList.length === loaded.length) {
        setSavedIndex(saved.idx);
        setCards(saved.cardList);
        setFetchedAt(Date.now());
        setShowResumePrompt(true);
        setLoading(false);
        return;
      }

      setCards(loaded);
      setFetchedAt(Date.now());
      if (id && loaded.length > 0) void saveSession(id, 0, loaded);
    } catch (e: any) {
      const saved = id ? await getSession(id) : { idx: 0, cardList: null };

      if (saved.cardList && saved.cardList.length > 0) {
        setSavedIndex(saved.idx);
        setCards(saved.cardList);
        setFetchedAt(Date.now());
        setShowResumePrompt(saved.idx > 0);
      } else {
        captureException(e, { feature: 'study', action: 'load_review_cards', extra: { deck_id: id } });
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, getToken, id, isOnline, queryClient]);

  const { data: allDecksData = [] } = useDecks();
  const allDecks: Deck[] = allDecksData;
  const decks = allDecks.filter((d: Deck) => d.deck_id !== id);

  useEffect(() => {
    if (id) {
      void loadCards();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStartOver = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setIndex(0);
    setShowResumePrompt(false);
    if (id) void saveSession(id, 0, shuffled);
  };

  const stateRef = useRef({ cards, id, getToken, isOnline });
  useEffect(() => {
    stateRef.current = { cards, id, getToken, isOnline };
  }, [cards, id, getToken, isOnline]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - fetchedAt > 14 * 60 * 1000) {
        if (id) {
          ImageRefreshService.refreshUrls(id, cards, setCards as any, getToken).then(() => {
            setFetchedAt(Date.now());
          });
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchedAt, id, cards, getToken]);

  const handleImageError = useCallback(() => {
    if (id) {
      ImageRefreshService.refreshUrls(id, cards, setCards as any, getToken).then(() => {
        setFetchedAt(Date.now());
      });
    }
  }, [id, cards, getToken]);

  const handleRate = useCallback((rating: string, cardId: string, cardIndex: number) => {
    const {
      cards: currentCards,
      id: currentId,
      getToken: currentGetToken,
      isOnline: currentIsOnline,
    } = stateRef.current;
    
    const recordReview = async () => {
      if (!currentId) return;

      if (!currentIsOnline) {
        await enqueuePendingReview({ card_id: cardId, deck_id: currentId, rating });
        return;
      }

      try {
        const token = await currentGetToken();
        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!token || !apiUrl) {
          await enqueuePendingReview({ card_id: cardId, deck_id: currentId, rating });
          return;
        }

        const response = await fetch(`${apiUrl}/reviews/${cardId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_id: cardId, deck_id: currentId, rating }),
        });

        if (!response.ok) {
          await enqueuePendingReview({ card_id: cardId, deck_id: currentId, rating });
        }
      } catch (error) {
        await enqueuePendingReview({ card_id: cardId, deck_id: currentId, rating });
        captureException(error, {
          feature: 'study',
          action: 'record_review',
          extra: { deck_id: currentId, card_id: cardId, rating },
        });
      }
    };
    void recordReview();

    if (cardIndex >= currentCards.length - 1) {
      addBreadcrumb('Study session completed', {
        deck_id: currentId,
        card_count: currentCards.length,
      }, 'study');
      void analyticsEvents.studyCompleted(currentId, currentCards.length);
      setDone(true);
      if (currentId) void clearSession(currentId);
    } else {
      const nextIdx = cardIndex + 1;
      if (currentId) void saveSession(currentId, nextIdx, currentCards);
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
    }
  }, [queryClient]);

  const renderFlashcard = useCallback(({ item, index: idx }: any) => (
    <FlashcardItem card={item} cardIndex={idx} onRate={handleRate} onImagePress={setZoomImage} />
  ), [handleRate]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setIndex(viewableItems[0].index);
    }
  }).current;

  if (done) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
              <Feather name="x" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={styles.topTitle}>Session Complete</Text>
            <View style={{ width: 36 }} />
          </View>
        </SafeAreaView>
        <ScrollView contentContainerStyle={styles.doneScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.celebrateCard}>
            <Image source={pikaAssets.yayDone} style={styles.celebrateImage} resizeMode="contain" />
            <Text style={styles.doneTitle}>All Done!</Text>
            <Text style={styles.doneSub}>Fantastic job! You've successfully finished this study session.</Text>
            
            {/* Session Stats Dash */}
            <View style={styles.statsDashRow}>
              <View style={styles.statsDashItem}>
                <Feather name="book-open" size={16} color={colors.primary} />
                <Text style={styles.statsDashVal}>{cards.length}</Text>
                <Text style={styles.statsDashLabel}>Reviewed</Text>
              </View>
              <View style={styles.statsDashItem}>
                <Feather name="check-circle" size={16} color="#3DBC8C" />
                <Text style={styles.statsDashVal}>100%</Text>
                <Text style={styles.statsDashLabel}>Completion</Text>
              </View>
            </View>
          </View>

          {decks.length > 0 && (
            <View style={styles.doneDecksWrap}>
              <Text style={styles.doneDecksSectionTitle}>KEEP THE MOMENTUM GOING</Text>
              <View style={styles.doneDecksList}>
                {decks.slice(0, 3).map((d: Deck, i: number) => (
                  <TouchableOpacity key={d.deck_id} activeOpacity={0.85} onPress={() => { router.replace(`/deck/${d.deck_id}` as any); }} style={styles.doneDeckRow}>
                    <View style={styles.doneDeckEmojiBg}>
                      <Text style={styles.doneDeckEmoji}>{deckEmoji(i)}</Text>
                    </View>
                    <View style={styles.doneDeckInfo}>
                      <Text style={styles.doneDeckRowTitle} numberOfLines={1}>{d.title}</Text>
                      <Text style={styles.doneDeckRowSub}>Ready for review</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.doneActionsWrap}>
            <TouchableOpacity style={styles.doneBtn} activeOpacity={0.9} onPress={() => router.back()}>
              <Text style={styles.doneBtnText}>Back to Library</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.doneSecondary} activeOpacity={0.8} onPress={() => {
              setDone(false);
              setIndex(0);
              setCards((prev) => [...prev].sort(() => Math.random() - 0.5));
            }}>
              <Feather name="refresh-cw" size={13} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.doneSecondaryText}>Review Session Again</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  const progress = cards.length > 0 ? ((index + (done ? 1 : 0)) / cards.length) * 100 : 0;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Feather name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <LinearGradient colors={[colors.primary, '#7C6FEF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{index + 1}/{cards.length}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading cards…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadCards} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : showResumePrompt ? (
        <View style={styles.resumePromptWrap}>
          <View style={styles.resumeCard}>
            <Image source={pikaAssets.hmm} style={{ width: 90, height: 90, marginBottom: 4 }} resizeMode="contain" />
            <Text style={styles.resumeTitle}>Resume Session?</Text>
            <Text style={styles.resumeSub}>You left off at card {savedIndex + 1} of {cards.length}. Would you like to continue from where you left off or start over?</Text>
            <View style={styles.resumeBtnGroup}>
              <TouchableOpacity style={styles.resumePrimaryBtn} activeOpacity={0.85} onPress={() => {
                setShowResumePrompt(false);
                setTimeout(() => flatListRef.current?.scrollToIndex({ index: savedIndex, animated: false }), 100);
              }}>
                <Text style={styles.resumePrimaryText}>Continue Session</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resumeSecondaryBtn} activeOpacity={0.85} onPress={handleStartOver}>
                <Text style={styles.resumeSecondaryText}>Start Over</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.centerWrap}>
          <Image source={pikaAssets.sleeping} style={{ width: 120, height: 120, marginBottom: 8 }} resizeMode="contain" />
          <Text style={styles.emptyTitle}>No cards to review</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cardArea}>
          <FlatList
            ref={flatListRef}
            data={cards}
            keyExtractor={(item) => item.card_id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
            getItemLayout={(_, idx) => ({ length: SCREEN_W, offset: SCREEN_W * idx, index: idx })}
            removeClippedSubviews={true}
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            updateCellsBatchingPeriod={100}
            renderItem={renderFlashcard}
            initialScrollIndex={showResumePrompt ? savedIndex : 0}
          />
        </View>
      )}

      {/* Zoom Modal */}
      <Modal visible={!!zoomImage} transparent={true} animationType="fade" onRequestClose={() => setZoomImage(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity 
            style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 24 }} 
            onPress={() => setZoomImage(null)}
          >
            <Feather name="x" size={24} color="#FFF" />
          </TouchableOpacity>
          <ScrollView maximumZoomScale={5} minimumZoomScale={1} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }} style={{ width: '100%' }}>
            <TouchableOpacity activeOpacity={1} onPress={() => setZoomImage(null)} style={{ flex: 1, width: SCREEN_W, minHeight: '100%', justifyContent: 'center' }}>
              <Image source={{ uri: zoomImage || '' }} style={{ width: SCREEN_W, height: '80%' }} resizeMode="contain" />
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '800', color: colors.foreground, flex: 1, textAlign: 'center' },
  progressWrap: { flex: 1, gap: 6 },
  progressTrack: { height: 10, backgroundColor: colors.muted, borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressLabel: { fontSize: 13, fontWeight: '800', color: colors.mutedForeground, textAlign: 'center', letterSpacing: 0.5 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingText: { fontSize: 14, color: colors.mutedForeground },
  cardArea: { flex: 1, paddingTop: 8, paddingBottom: 16 },
  tapHint: { textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.mutedForeground, marginBottom: 8 },
  cardOuter: { flex: 1, marginBottom: 12 },
  cardTapTarget: { flex: 1, position: 'relative' },
  cardFace: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: 'hidden' },
  cardFront: { zIndex: 2 },
  cardBack: { zIndex: 1 },
  cardFrontScrollContent: { flexGrow: 1, justifyContent: 'center', paddingBottom: 48 },
  cardBackScrollContent: { flexGrow: 1, justifyContent: 'center', paddingBottom: 48 },
  cardSide: { backgroundColor: colors.card, borderRadius: 28, borderWidth: 1.5, borderColor: colors.border, padding: 28, justifyContent: 'center', ...shadows.soft },
  sideLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.primary, marginBottom: 12, textAlign: 'center' },
  questionText: { fontSize: 22, fontWeight: '700', color: colors.foreground, lineHeight: 32, textAlign: 'center' },
  answerText: { fontSize: 20, fontWeight: '600', color: colors.foreground, lineHeight: 30, textAlign: 'center' },
  explanationText: { fontSize: 14, color: colors.mutedForeground, lineHeight: 22, marginTop: 4, textAlign: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  flipHintRow: { position: 'absolute', bottom: 24, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  flipHintText: { fontSize: 12, color: colors.mutedForeground, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  ratingBtn: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: radius['2xl'], gap: 4 },
  ratingLabel: { fontSize: 11, fontWeight: '800' },
  ratingPlaceholder: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: radius['2xl'], backgroundColor: colors.muted },
  ratingPlaceholderText: { fontSize: 13, color: colors.mutedForeground, fontWeight: '600' },
  doneScrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10 },
  celebrateCard: { backgroundColor: colors.card, borderRadius: 28, borderWidth: 1.5, borderColor: colors.border, padding: 28, alignItems: 'center', marginBottom: 24, ...shadows.soft },
  celebrateImage: { width: 140, height: 140, marginBottom: 12 },
  doneTitle: { fontSize: 28, fontWeight: '900', color: colors.foreground },
  doneSub: { fontSize: 14, color: colors.mutedForeground, textAlign: 'center', lineHeight: 22, marginTop: 6, marginBottom: 20 },
  statsDashRow: { flexDirection: 'row', gap: 12, width: '100%' },
  statsDashItem: { flex: 1, backgroundColor: '#F8F9FA', borderRadius: 16, padding: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)' },
  statsDashVal: { fontSize: 20, fontWeight: '900', color: colors.foreground, marginTop: 4 },
  statsDashLabel: { fontSize: 10, fontWeight: '700', color: colors.mutedForeground, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  doneDecksWrap: { marginBottom: 24 },
  doneDecksSectionTitle: { fontSize: 11, fontWeight: '800', color: colors.mutedForeground, letterSpacing: 0.8, marginBottom: 12 },
  doneDecksList: { gap: 10 },
  doneDeckRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 14, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.04)', ...shadows.soft },
  doneDeckEmojiBg: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  doneDeckEmoji: { fontSize: 16 },
  doneDeckInfo: { flex: 1, minWidth: 0 },
  doneDeckRowTitle: { fontSize: 14, fontWeight: '800', color: colors.foreground },
  doneDeckRowSub: { fontSize: 11, color: colors.mutedForeground, fontWeight: '600', marginTop: 2 },
  
  doneActionsWrap: { gap: 12, alignItems: 'center', width: '100%' },
  doneBtn: { backgroundColor: colors.primary, height: 52, borderRadius: 26, width: '100%', alignItems: 'center', justifyContent: 'center', ...shadows.pop },
  doneBtnText: { color: colors.primaryForeground, fontWeight: '800', fontSize: 15 },
  doneSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  doneSecondaryText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  resumePromptWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  resumeCard: { backgroundColor: colors.card, borderRadius: 32, borderWidth: 1, borderColor: colors.border, padding: 32, alignItems: 'center', gap: 16, width: '100%', ...shadows.soft },
  resumeIconBg: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(91, 79, 230, 0.08)', alignItems: 'center', justifyContent: 'center' },
  resumeTitle: { fontSize: 22, fontWeight: '800', color: colors.foreground },
  resumeSub: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 },
  resumeBtnGroup: { width: '100%', gap: 12, marginTop: 8 },
  resumePrimaryBtn: { backgroundColor: colors.primary, borderRadius: radius['2xl'], paddingVertical: 14, alignItems: 'center', ...shadows.pop },
  resumePrimaryText: { color: colors.primaryForeground, fontWeight: '800', fontSize: 15 },
  resumeSecondaryBtn: { backgroundColor: colors.muted, borderRadius: radius['2xl'], paddingVertical: 14, alignItems: 'center' },
  resumeSecondaryText: { color: colors.foreground, fontWeight: '800', fontSize: 15 },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius['2xl'] },
  retryText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 13 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground, marginTop: 8 },
});
