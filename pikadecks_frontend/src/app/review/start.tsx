import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors, shadows, radius } from '@/constants/theme';
import { useDecks } from '@/hooks/useDecks';
import { useStats, EMPTY_STATS, useStudyStreak } from '@/hooks/useStats';

const TINTS = ['#EEF2FF', '#FFF7ED', '#ECFEFF', '#FFF1F2', '#F0FDF4', '#FEFCE8'];
const EMOJIS = ['📚', '🧬', '🏛️', '⚛️', '🌍', '🎨', '🔬', '💡'];
function deckTint(i: number) { return TINTS[i % TINTS.length]; }
function deckEmoji(i: number) { return EMOJIS[i % EMOJIS.length]; }

const CACHE_KEY_DECKS = 'pikadecks:review_selected_decks';
const CACHE_KEY_ORDER = 'pikadecks:review_order';

export default function StartReviewPage() {
  const router = useRouter();
  const { data: decks = [], isLoading: decksLoading, error: decksError, refetch: refetchDecks } = useDecks();
  const { data: stats = EMPTY_STATS, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useStats();
  const { data: streakData, isLoading: streakLoading, error: streakError, refetch: refetchStreak } = useStudyStreak();

  const queryError = decksError || statsError || streakError;

  const [selectedDecks, setSelectedDecks] = useState<Record<string, boolean>>({});
  const [reviewOrder, setReviewOrder] = useState<'sequential' | 'shuffle'>('shuffle'); // Default: shuffle
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load cached settings
  useEffect(() => {
    async function loadCachedSettings() {
      try {
        const cachedDecks = await AsyncStorage.getItem(CACHE_KEY_DECKS);
        const cachedOrder = await AsyncStorage.getItem(CACHE_KEY_ORDER);

        if (cachedOrder === 'sequential' || cachedOrder === 'shuffle') {
          setReviewOrder(cachedOrder);
        }

        if (cachedDecks) {
          setSelectedDecks(JSON.parse(cachedDecks));
        } else if (decks.length > 0) {
          // Default all selected
          const initialSelection: Record<string, boolean> = {};
          decks.forEach((d: any) => {
            initialSelection[d.deck_id] = true;
          });
          setSelectedDecks(initialSelection);
        }
      } catch (e) {
        // Fallback
      } finally {
        setCacheLoaded(true);
      }
    }
    if (decks.length > 0) {
      void loadCachedSettings();
    } else if (!decksLoading) {
      setCacheLoaded(true);
    }
  }, [decks, decksLoading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchDecks(), refetchStats(), refetchStreak()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchDecks, refetchStats, refetchStreak]);

  // If new decks are added later, make sure they are selected by default
  useEffect(() => {
    if (cacheLoaded && decks.length > 0) {
      let changed = false;
      const updated = { ...selectedDecks };
      decks.forEach((d: any) => {
        if (updated[d.deck_id] === undefined) {
          updated[d.deck_id] = true;
          changed = true;
        }
      });
      if (changed) {
        setSelectedDecks(updated);
        void AsyncStorage.setItem(CACHE_KEY_DECKS, JSON.stringify(updated));
      }
    }
  }, [decks, cacheLoaded]);

  // Persist selections
  const toggleDeck = async (deckId: string) => {
    const updated = { ...selectedDecks, [deckId]: !selectedDecks[deckId] };
    setSelectedDecks(updated);
    try {
      await AsyncStorage.setItem(CACHE_KEY_DECKS, JSON.stringify(updated));
    } catch (e) {}
  };

  const handleSetOrder = async (order: 'sequential' | 'shuffle') => {
    setReviewOrder(order);
    try {
      await AsyncStorage.setItem(CACHE_KEY_ORDER, order);
    } catch (e) {}
  };

  const toggleSelectAll = async () => {
    const allSelected = decks.every((d: any) => selectedDecks[d.deck_id]);
    const updated: Record<string, boolean> = {};
    decks.forEach((d: any) => {
      updated[d.deck_id] = !allSelected;
    });
    setSelectedDecks(updated);
    try {
      await AsyncStorage.setItem(CACHE_KEY_DECKS, JSON.stringify(updated));
    } catch (e) {}
  };

  const breakdown = (stats as any)?.decks_breakdown || {};

  // Compute stats based on current selected decks
  const sessionStats = useMemo(() => {
    let due = 0;
    let overdue = 0;
    let newCards = 0;
    let total = 0;

    decks.forEach((d: any) => {
      if (selectedDecks[d.deck_id]) {
        const deckBreakdown = breakdown[d.deck_id] || { due: 0, overdue: 0, new: 0, total: 0 };
        due += deckBreakdown.due || 0;
        overdue += deckBreakdown.overdue || 0;
        newCards += deckBreakdown.new || 0;
        total += deckBreakdown.total || 0;
      }
    });

    // Due/overdue are stats only; a review session should include all selected cards.
    const totalSessionCards = total;
    const estMinutes = totalSessionCards > 0 ? Math.max(1, Math.round(totalSessionCards * 0.25)) : 0;

    return { due, overdue, newCards, total: totalSessionCards, estMinutes };
  }, [decks, selectedDecks, breakdown]);

  const selectedCount = decks.filter((d: any) => selectedDecks[d.deck_id]).length;
  const hasSelectedDecks = selectedCount > 0;
  const sessionLimit = sessionStats.total > 0 ? Math.min(sessionStats.total, 200) : 200;

  const handleStartReview = () => {
    const activeDeckIds = decks
      .filter((d: any) => selectedDecks[d.deck_id])
      .map((d: any) => d.deck_id);

    if (activeDeckIds.length === 0) return;

    // Navigate to review/[id] with comma-separated list of deck IDs, custom limit, and review order
    router.push({
      pathname: `/review/${activeDeckIds.join(',')}`,
      params: {
        limit: String(sessionLimit),
        order: reviewOrder,
      },
    } as any);
  };

  const streakValue = stats.current_streak || 0;
  const streak = streakData?.current_streak ?? streakValue;
  const loading = decksLoading || statsLoading || refreshing || !cacheLoaded;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/streak')}
            style={styles.streakBadge}
          >
            <MaterialCommunityIcons name="fire" size={16} color="#FF7A00" />
            <Text style={styles.streakText}>{streak}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Preparing review session…</Text>
        </View>
      ) : queryError ? (
        <View style={styles.centerWrap}>
          <Text style={styles.errorText}>{queryError.message}</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : decks.length === 0 ? (
        <View style={styles.centerWrap}>
          <Text style={styles.emptyTitle}>No study decks found</Text>
          <Text style={styles.emptySub}>Create or import a deck first to start reviewing.</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          >
            <View style={styles.titleSection}>
              <Text style={styles.title}>Start Review</Text>
              <Text style={styles.subtitle}>Pick the decks you want to study now.</Text>
            </View>

            {/* Overview Session Card */}
            <View style={styles.sessionCard}>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, styles.badgeDue]}>
                  <Text style={[styles.badgeValue, styles.textDue]}>{sessionStats.due}</Text>
                  <Text style={styles.badgeLabel}>Due</Text>
                </View>
                <View style={[styles.badge, styles.badgeOverdue]}>
                  <Text style={[styles.badgeValue, styles.textOverdue]}>{sessionStats.overdue}</Text>
                  <Text style={styles.badgeLabel}>Overdue</Text>
                </View>
                <View style={[styles.badge, styles.badgeNew]}>
                  <Text style={[styles.badgeValue, styles.textNew]}>{sessionStats.newCards}</Text>
                  <Text style={styles.badgeLabel}>New</Text>
                </View>
              </View>
            </View>

            {/* Review Order Options */}
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionLabel}>REVIEW ORDER</Text>
            </View>
            <View style={styles.orderRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => handleSetOrder('sequential')}
                style={[styles.orderCard, reviewOrder === 'sequential' && styles.orderCardActive]}
              >
                <View style={[styles.orderIconBg, reviewOrder === 'sequential' && styles.orderIconBgActive]}>
                  <Feather name="list" size={18} color={reviewOrder === 'sequential' ? colors.primary : colors.mutedForeground} />
                </View>
                <Text style={styles.orderTitle}>Sequential</Text>
                <Text style={styles.orderDesc}>Deck by deck, in order</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => handleSetOrder('shuffle')}
                style={[styles.orderCard, reviewOrder === 'shuffle' && styles.orderCardActive]}
              >
                <View style={[styles.orderIconBg, reviewOrder === 'shuffle' && styles.orderIconBgActive]}>
                  <Feather name="shuffle" size={18} color={reviewOrder === 'shuffle' ? colors.primary : colors.mutedForeground} />
                </View>
                <Text style={styles.orderTitle}>Shuffle</Text>
                <Text style={styles.orderDesc}>Remix all cards</Text>
              </TouchableOpacity>
            </View>

            {/* Decks Selection List */}
            <View style={styles.deckListHeader}>
              <Text style={styles.sectionLabel}>DECKS • {selectedCount}/{decks.length}</Text>
              <TouchableOpacity onPress={toggleSelectAll}>
                <Text style={styles.toggleAllText}>
                  {decks.every((d: any) => selectedDecks[d.deck_id]) ? 'Deselect all' : 'Select all'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.deckList}>
              {decks.map((deck: any, idx: number) => {
                const isSelected = !!selectedDecks[deck.deck_id];
                const statsInfo = breakdown[deck.deck_id] || { due: 0, overdue: 0, new: 0 };
                
                return (
                  <TouchableOpacity
                    key={deck.deck_id}
                    activeOpacity={0.85}
                    onPress={() => toggleDeck(deck.deck_id)}
                    style={[styles.deckRow, isSelected && styles.deckRowActive]}
                  >
                    <View style={[styles.deckEmojiBg, { backgroundColor: deckTint(idx) }]}>
                      <Text style={styles.deckEmoji}>{deckEmoji(idx)}</Text>
                    </View>
                    <View style={styles.deckInfo}>
                      <Text style={styles.deckTitle} numberOfLines={1}>
                        {deck.title}
                      </Text>
                      <Text style={styles.deckStats}>
                        {statsInfo.due} due  •  {statsInfo.overdue} overdue{statsInfo.new > 0 ? `  •  ${statsInfo.new} new` : ''}
                      </Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                      {isSelected && <Feather name="check" size={13} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Sticky footer with start button */}
          <View style={styles.footer}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleStartReview}
              disabled={!hasSelectedDecks}
              style={[
                styles.startBtn,
                !hasSelectedDecks && styles.startBtnDisabled,
              ]}
            >
              <Feather name="play" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.startBtnText}>
                {sessionStats.total > 0 ? `Start Pratice ${sessionStats.total} cards` : 'Launch Session'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAF9F6' },
  safeArea: { backgroundColor: '#FAF9F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    ...shadows.soft,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    gap: 4,
    ...shadows.soft,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.foreground,
  },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingText: { fontSize: 14, color: colors.mutedForeground, fontWeight: '600' },
  errorText: { fontSize: 14, color: colors.danger, fontWeight: '600', textAlign: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  emptySub: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center', marginTop: 4 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120, paddingTop: 2 },
  titleSection: { marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '900', color: colors.foreground, fontFamily: 'System' },
  subtitle: { fontSize: 14, color: colors.mutedForeground, fontWeight: '600', marginTop: 4 },
  
  sessionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    padding: 20,
    marginBottom: 24,
    ...shadows.soft,
  },
  sessionOverviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    paddingBottom: 16,
    marginBottom: 16,
  },
  sessionCardCount: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.foreground,
    lineHeight: 40,
  },
  sessionCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginTop: 2,
  },
  timeEstimate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedForeground,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  badge: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#F8F9FA',
  },
  badgeDue: { backgroundColor: 'rgba(91, 79, 230, 0.04)' },
  badgeOverdue: { backgroundColor: 'rgba(245, 158, 11, 0.04)' },
  badgeNew: { backgroundColor: 'rgba(61, 188, 140, 0.04)' },
  badgeValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  textDue: { color: colors.primary },
  textOverdue: { color: '#F59E0B' },
  textNew: { color: '#3DBC8C' },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.mutedForeground,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  sectionHeaderWrap: {
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.mutedForeground,
    letterSpacing: 0.8,
  },
  orderRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  orderCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.05)',
    padding: 16,
    ...shadows.soft,
  },
  orderCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#F5F3FF',
  },
  orderIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  orderIconBgActive: {
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
  },
  orderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.foreground,
  },
  orderDesc: {
    fontSize: 11,
    color: colors.mutedForeground,
    fontWeight: '600',
    marginTop: 2,
  },

  deckListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  deckList: {
    gap: 10,
  },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.04)',
    ...shadows.soft,
  },
  deckRowActive: {
    borderColor: colors.primary,
  },
  deckEmojiBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  deckEmoji: {
    fontSize: 20,
  },
  deckInfo: {
    flex: 1,
    marginRight: 10,
  },
  deckTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.foreground,
  },
  deckStats: {
    fontSize: 11,
    color: colors.mutedForeground,
    fontWeight: '600',
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(250, 249, 246, 0.9)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.03)',
  },
  startBtn: {
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.pop,
  },
  startBtnDisabled: {
    backgroundColor: 'rgba(91, 79, 230, 0.4)',
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  retryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius['2xl'],
    marginTop: 8,
  },
  retryText: {
    color: colors.primaryForeground || '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
