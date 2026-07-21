import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/clerk-expo';
import { useDecks } from '@/hooks/useDecks';
import { EMPTY_STATS, useStats, useStudyStreak } from '@/hooks/useStats';
import { LinearGradient } from 'expo-linear-gradient';

import { AuthenticatedShell } from '@/components/authenticated-shell';
import { LockedFeatureModal } from '@/components/LockedFeatureModal';
import { colors, shadows, radius } from '@/constants/theme';
import { pikaAssets } from '@/constants/assets';

const TINTS = ['#EEF2FF', '#FFF7ED', '#ECFEFF', '#FFF1F2', '#F0FDF4', '#FEFCE8'];
const EMOJIS = ['📚', '🧬', '🏛️', '⚛️', '🌍', '🎨', '🔬', '💡'];
function deckTint(i: number) { return TINTS[i % TINTS.length]; }
function deckEmoji(i: number) { return EMOJIS[i % EMOJIS.length]; }

type Deck = {
  deck_id: string;
  title: string;
  description?: string | null;
};

export default function HomePage() {
  const router = useRouter();
  const { user } = useUser();
  
  const { data: decksData = [], isLoading: loading, error: queryError, refetch } = useDecks();
  const { data: stats = EMPTY_STATS, isLoading: statsLoading, refetch: refetchStats } = useStats();
  const { data: streakData, isLoading: streakLoading, refetch: refetchStreak } = useStudyStreak();
  const decks: Deck[] = decksData;
  const error = queryError ? queryError.message : null;
  
  const [youtubeModalVisible, setYoutubeModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = () => {
    void refetch();
    void refetchStats();
    void refetchStreak();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchStats(), refetchStreak()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refetchStats, refetchStreak]);

  const streakValue = stats.current_streak || 0;
  const streak = streakData?.current_streak ?? streakValue;
  const dueTotal = stats.due_today || 0;

  const streakProp = streakData
    ? { value: streakData.current_streak, state: streakData.state }
    : { value: streakValue, state: 'ACTIVE' as const };

  return (
    <AuthenticatedShell
      title="PikaDecks"
      subtitle={`Hey ${user?.firstName ?? 'User'}, ready to smash it?`}
      streak={streakProp}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <LockedFeatureModal
        visible={youtubeModalVisible}
        onClose={() => setYoutubeModalVisible(false)}
        title="YouTube Import"
        badge="Developer Stage"
        description="YouTube import is currently in developer stage and will be available in a future update."
        iconName="youtube"
      />

      <View style={styles.body}>
        {/* Due card */}
        {loading || statsLoading ? (
          <View style={styles.dueCardLoader}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.loaderText}>Checking due cards…</Text>
          </View>
        ) : decks.length === 0 ? (
          <View style={styles.dueCardNoDecks} testID="due-card-no-decks">
            <Image
              source={pikaAssets.hiThere}
              style={{ width: 64, height: 64 }}
              resizeMode="contain"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.noDecksTitle}>Welcome to Pika! 🚀</Text>
              <Text style={styles.noDecksText}>
                Upload content or notes below to generate your first deck and start learning.
              </Text>
            </View>
          </View>
        ) : dueTotal > 0 ? (
          <View style={styles.dueReviewCard}>
            <View style={styles.dueReviewHeader}>
              <View style={styles.dueReviewIcon}>
                <Feather name="clock" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dueReviewTitle}>Due Today</Text>
                <Text style={styles.dueReviewSub}>
                  {dueTotal} card{dueTotal !== 1 ? 's' : ''} ready
                  {stats.overdue > 0 ? `, ${stats.overdue} overdue` : ''}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.dueReviewButton}
                onPress={() => router.push('/review/start' as any)}
              >
                <Text style={styles.dueReviewButtonText}>Review</Text>
                <Feather name="arrow-right" size={13} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
            <View style={styles.srsMetricRow}>
              <View style={styles.srsMetric}>
                <Text style={styles.srsMetricValue}>{stats.cards_learned}</Text>
                <Text style={styles.srsMetricLabel}>Learned</Text>
              </View>
              <View style={styles.srsMetric}>
                <Text style={styles.srsMetricValue}>{streak}</Text>
                <Text style={styles.srsMetricLabel}>Streak</Text>
              </View>
              <View style={styles.srsMetric}>
                <Text style={styles.srsMetricValue}>{stats.upcoming_reviews}</Text>
                <Text style={styles.srsMetricLabel}>Upcoming</Text>
              </View>
            </View>
          </View>
        ) : dueTotal === 0 ? (
          <View style={styles.dueCardEmpty} testID="due-card-empty">
            <LinearGradient
              colors={['rgba(61, 188, 140, 0.08)', 'rgba(61, 188, 140, 0.02)']}
              style={styles.emptyGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.emptyHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.emptyTitle}>All caught up! 🎉</Text>
                  <Text style={styles.emptyStateText}>
                    {streak > 0
                      ? `You've finished all reviews. Keep your ${streak}-day streak going!`
                      : "No cards due for review today. Great work!"}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.emptyReviewButton}
                onPress={() => router.push('/review/start' as any)}
              >
                <Text style={styles.emptyReviewButtonText}>Review Again</Text>
                <Feather name="arrow-right" size={13} color={colors.primaryForeground} />
              </TouchableOpacity>
            </LinearGradient>
          </View>
        ) : null}

        {/* My Decks */}
        <View>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>My Decks</Text>
            <View style={styles.sectionHeadActions}>
              <TouchableOpacity
                testID="section-add-deck"
                onPress={() => router.push('/decks?create=1' as any)}
                style={styles.deckIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="plus" size={14} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/decks')} testID="view-all-decks">
                <Text style={styles.linkSmall}>View all</Text>
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
          ) : error ? (
            <View style={styles.errorBox}>
              <Image
                source={pikaAssets.oops}
                style={{ width: 80, height: 80, marginBottom: 8 }}
                resizeMode="contain"
              />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => loadDashboard()} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : decks.length === 0 ? (
            <View style={styles.emptyBox}>
              <Image
                source={pikaAssets.newDeck}
                style={{ width: 100, height: 100, marginBottom: 12 }}
                resizeMode="contain"
              />
              <Text style={styles.emptyText}>No decks yet — upload some content to get started!</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {decks.slice(0, 3).map((d: Deck, i: number) => (
                <TouchableOpacity
                  key={d.deck_id}
                  testID={`deck-card-${d.deck_id}`}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/deck/${d.deck_id}` as any)}
                  style={styles.deckRow}
                >
                  <View style={[styles.deckEmoji, { backgroundColor: deckTint(i) }]}>
                    <Text style={{ fontSize: 24 }}>{deckEmoji(i)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deckTitle} numberOfLines={1}>{d.title}</Text>
                    {d.description ? (
                      <Text style={styles.deckSub} numberOfLines={1}>{d.description}</Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    </AuthenticatedShell>
  );
}



const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, marginTop: 12, gap: 28 },
  dueCardLoader: {
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
    ...shadows.soft,
  },
  loaderText: {
    fontSize: 14,
    color: colors.mutedForeground,
    fontWeight: '600',
  },
  dueReviewCard: {
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(91, 79, 230, 0.18)',
    gap: 16,
    ...shadows.soft,
  },
  dueReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  dueReviewIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueReviewTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '900',
  },
  dueReviewSub: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  dueReviewButton: {
    minHeight: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dueReviewButtonText: {
    color: colors.primaryForeground,
    fontSize: 12,
    fontWeight: '900',
  },
  srsMetricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  srsMetric: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: radius.xl,
    paddingVertical: 10,
    alignItems: 'center',
  },
  srsMetricValue: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '900',
  },
  srsMetricLabel: {
    color: colors.mutedForeground,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  dueCardNoDecks: {
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    ...shadows.soft,
  },
  noDecksIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius['xl'],
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDecksTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.foreground,
    marginBottom: 4,
  },
  noDecksText: {
    fontSize: 12,
    color: colors.mutedForeground,
    lineHeight: 17,
  },
  dueCardEmpty: {
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: 'rgba(61, 188, 140, 0.25)',
    overflow: 'hidden',
    ...shadows.soft,
  },
  emptyGradient: {
    padding: 20,
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  emptyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  emptyReviewButton: {
    alignSelf: 'stretch',
    minHeight: 42,
    marginTop: 16,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyReviewButtonText: {
    color: colors.primaryForeground,
    fontSize: 13,
    fontWeight: '900',
  },
  emptyIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius['xl'],
    backgroundColor: 'rgba(61, 188, 140, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.success,
    marginBottom: 4,
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.mutedForeground,
    lineHeight: 17,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.foreground, marginBottom: 12 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  sectionHeadActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deckIconBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkSmall: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, aspectRatio: 1, backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 8 },
  lockedTileOuter: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius['2xl'],
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'rgba(91, 79, 230, 0.2)',
    overflow: 'hidden',
    backgroundColor: colors.card,
    ...shadows.soft,
  },
  lockedTileGradient: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(91, 79, 230, 0.25)',
  },
  lockBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  lockedTileIcon: {
    backgroundColor: 'rgba(91, 79, 230, 0.12)',
  },
  lockedTileLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  tileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground },
  deckRow: { backgroundColor: colors.card, padding: 16, borderRadius: radius['3xl'], flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, borderColor: colors.border, ...shadows.soft },
  deckEmoji: { width: 56, height: 56, borderRadius: radius['2xl'], alignItems: 'center', justifyContent: 'center' },
  deckTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  deckSub: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  errorBox: { backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', gap: 12 },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius['2xl'] },
  retryText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 13 },
  emptyBox: { backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },

  /* Interactive slider styles matching Magic Upload cards */
  sliderCard: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 14,
    gap: 12,
    ...shadows.soft,
  },
  sliderHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sliderTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
  sliderValueBadge: {
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sliderValueText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  sliderBarContainer: {
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrack: {
    height: 6,
    backgroundColor: colors.muted,
    borderRadius: 3,
    width: '100%',
  },
  sliderFill: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
    position: 'absolute',
    left: 0,
  },
  sliderKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: colors.primary,
    position: 'absolute',
    marginTop: -7, // Offset by half of height minus half of track height
    marginLeft: -10, // Center knob over coordinate
    ...shadows.soft,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLimitLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.mutedForeground,
  },
});
