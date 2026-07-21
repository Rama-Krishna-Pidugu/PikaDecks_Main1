import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useToast } from '@/components/ui/ToastProvider';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, shadows } from '@/constants/theme';
import { pikaAssets } from '@/constants/assets';
import {
  useStudyStreak,
  useReviewProgress,
  useRestoreStreak,
  useStudyStats,
} from '@/hooks/useStats';

export default function StreakPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const { data: streak, isLoading: streakLoading, refetch: refetchStreak } = useStudyStreak();
  const { data: progress, isLoading: progressLoading, refetch: refetchProgress } = useReviewProgress();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useStudyStats();
  const restoreMutation = useRestoreStreak();

  const loading = streakLoading || progressLoading || statsLoading;
  const [refreshing, setRefreshing] = React.useState(false);
  const [remainingSeconds, setRemainingSeconds] = React.useState<number | null>(streak?.seconds_until_expiry ?? null);

  React.useEffect(() => {
    setRemainingSeconds(streak?.seconds_until_expiry ?? null);
  }, [streak?.seconds_until_expiry]);

  useFocusEffect(
    React.useCallback(() => {
      void refetchStreak();
      void refetchProgress();
      void refetchStats();
    }, [refetchStreak, refetchProgress, refetchStats])
  );

  React.useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((value) => {
        if (value === null) return null;
        return Math.max(0, value - 1);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds]);

  React.useEffect(() => {
    if (remainingSeconds === 0 && streak?.state === 'FROZEN') {
      void refetchStreak();
    }
  }, [remainingSeconds, refetchStreak, streak?.state]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchStreak(), refetchProgress(), refetchStats()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchStreak, refetchProgress, refetchStats]);

  const formatCountdown = (seconds: number | null) => {
    if (seconds === null) return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const handleRestore = () => {
    if (!streak?.can_restore) return;

    restoreMutation.mutate(undefined, {
      onSuccess: () => {
        void refetchStreak();
        showToast('Streak restored!', 'success');
      },
      onError: (err: any) => {
        showToast(err.message || 'Failed to restore streak.', 'error');
      },
    });
  };

  const renderDotGrid = () => {
    if (!progress) return null;
    const completed = progress.reviews_completed_today;
    const remaining = progress.remaining_reviews;
    const total = completed + remaining;
    if (total === 0) {
      return (
        <View style={styles.emptyGridWrap}>
          <Text style={styles.emptyGridText}>All caught up for today!</Text>
        </View>
      );
    }

    const reviewsPerDot = 5;
    const completedDots = Math.floor(completed / reviewsPerDot);
    const remainingDots = Math.ceil(remaining / reviewsPerDot);
    const totalDots = Math.min(40, Math.max(1, completedDots + remainingDots));
    const dots = Array.from({ length: totalDots }, (_, idx) => (idx < completedDots ? 'completed' : 'pending'));

    return (
      <View style={styles.dotGridContainer}>
        <View style={styles.dotGrid}>
          {dots.map((state, idx) => (
            <View key={idx} style={[styles.dot, state === 'completed' && styles.dotCompleted, state === 'pending' && styles.dotPending]} />
          ))}
        </View>
        <View style={styles.gridLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, styles.dotCompleted, { margin: 0 }]} />
            <Text style={styles.legendLabel}>Completed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, styles.dotPending, { margin: 0 }]} />
            <Text style={styles.legendLabel}>Remaining</Text>
          </View>
          <Text style={styles.legendValue}>{completed} / {total} reviews</Text>
        </View>
      </View>
    );
  };

  const isFrozen = streak?.state === 'FROZEN';
  const isBroken = streak?.state === 'BROKEN';
  const countdown = formatCountdown(remainingSeconds);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Feather name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Study Streak</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading streak stats...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          <View style={[styles.streakHeroCard, isFrozen && styles.frozenCard, isBroken && styles.brokenCard]}>
            <Image
              source={isFrozen ? pikaAssets.sleeping : pikaAssets.onFire}
              style={[styles.flameImage, isFrozen && styles.iceImage, isBroken && styles.brokenImage]}
              resizeMode="contain"
            />
            <Text style={styles.streakNumber}>{streak?.current_streak || 0}</Text>
            <Text style={[styles.streakLabel, isFrozen && styles.frozenLabel, isBroken && styles.brokenLabel]}>
              {isFrozen ? 'Streak Frozen' : isBroken ? 'Streak Broken' : 'Day Study Streak'}
            </Text>
            {isFrozen && (
              <Text style={styles.freezeTimer}>
                {countdown ? `${countdown} left to restore` : 'Study now to restore'}
              </Text>
            )}
            <Text style={styles.streakTip}>
              Review at least {streak?.daily_goal?.cards_required || 10} cards daily to build your habit.
            </Text>
          </View>

          <View style={styles.statsBadgesRow}>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{streak?.longest_streak || 0}</Text>
              <Text style={styles.statLabel}>Longest Streak</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{stats?.total_study_days || 0}</Text>
              <Text style={styles.statLabel}>Study Days</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{stats?.hours_studied || 0}h</Text>
              <Text style={styles.statLabel}>Hours Studied</Text>
            </View>
          </View>

          {(isFrozen || isBroken) && (
            <View style={styles.restoreCard}>
              <View style={styles.restoreInfo}>
                <MaterialCommunityIcons name="shield-cross" size={24} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.restoreTitle}>
                    {isFrozen ? `${streak?.protected_streak_value || streak?.current_streak || 0} days protected` : 'Restore your streak'}
                  </Text>
                  <Text style={styles.restoreDesc}>
                    {streak?.can_restore
                      ? 'Use a restore token, or complete a study session while time remains.'
                      : 'Complete a study session to start a fresh streak.'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                disabled={restoreMutation.isPending || !streak?.can_restore}
                onPress={handleRestore}
                style={[styles.restoreBtn, (restoreMutation.isPending || !streak?.can_restore) && styles.disabled]}
              >
                {restoreMutation.isPending ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.restoreBtnText}>Use Token ({streak?.restore_tokens || 0})</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>TODAY'S REVIEW PROGRESS</Text>
            {renderDotGrid()}
          </View>

          {streak?.milestones && (
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>STREAK MILESTONES</Text>
              <View style={styles.milestonesList}>
                {streak.milestones.map((m) => (
                  <View key={m.days} style={[styles.milestoneRow, m.reached && styles.milestoneRowReached]}>
                    <View style={[styles.milestoneIconBg, m.reached ? styles.milestoneIconBgReached : styles.milestoneIconBgLocked]}>
                      <Feather name={m.reached ? 'award' : 'lock'} size={16} color={m.reached ? '#FF7A00' : colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.milestoneName, m.reached && styles.milestoneTextReached]}>{m.name}</Text>
                      <Text style={styles.milestoneDays}>{m.days} day challenge</Text>
                    </View>
                    {m.reached ? <View style={styles.badgeChecked}><Feather name="check" size={12} color="#FFFFFF" /></View> : <Text style={styles.milestoneLockedLabel}>Locked</Text>}
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAF9F6' },
  safeArea: { backgroundColor: '#FAF9F6' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.03)' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', ...shadows.soft },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingText: { fontSize: 14, color: colors.mutedForeground, fontWeight: '600' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: 16 },
  streakHeroCard: { backgroundColor: colors.card, borderRadius: 28, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.04)', padding: 24, alignItems: 'center', marginBottom: 16, ...shadows.soft },
  frozenCard: { borderColor: 'rgba(165, 180, 252, 0.4)', backgroundColor: '#F8FAFF' },
  brokenCard: { borderColor: 'rgba(239, 68, 68, 0.24)', backgroundColor: '#FFF7F7' },
  flameImage: { width: 140, height: 140, marginBottom: 12 },
  iceImage: { opacity: 0.92, transform: [{ scale: 0.96 }] },
  brokenImage: { opacity: 0.55 },
  streakNumber: { fontSize: 48, fontWeight: '900', color: colors.foreground, lineHeight: 52 },
  streakLabel: { fontSize: 16, fontWeight: '800', color: '#FF7A00', marginTop: 4 },
  frozenLabel: { color: '#818CF8' },
  brokenLabel: { color: '#DC2626' },
  freezeTimer: { fontSize: 12, fontWeight: '700', color: '#6366F1', marginTop: 8 },
  streakTip: { fontSize: 12, color: colors.mutedForeground, fontWeight: '600', textAlign: 'center', marginTop: 12, lineHeight: 18 },
  statsBadgesRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 20, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)', ...shadows.soft },
  statVal: { fontSize: 18, fontWeight: '900', color: colors.foreground },
  statLabel: { fontSize: 10, color: colors.mutedForeground, fontWeight: '700', marginTop: 2 },
  restoreCard: { backgroundColor: colors.card, borderRadius: 24, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)', padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, ...shadows.soft },
  restoreInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  restoreTitle: { fontSize: 14, fontWeight: '800', color: colors.foreground },
  restoreDesc: { fontSize: 11, color: colors.mutedForeground, fontWeight: '600', marginTop: 2 },
  restoreBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, ...shadows.pop },
  restoreBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  sectionWrap: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: colors.mutedForeground, letterSpacing: 0.8, marginBottom: 12 },
  emptyGridWrap: { backgroundColor: 'rgba(61, 188, 140, 0.06)', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(61, 188, 140, 0.15)' },
  emptyGridText: { fontSize: 13, fontWeight: '700', color: colors.success },
  dotGridContainer: { backgroundColor: colors.card, borderRadius: 24, padding: 18, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.03)', ...shadows.soft },
  dotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start', marginBottom: 16 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  dotCompleted: { backgroundColor: colors.success, borderColor: colors.success },
  dotPending: { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.08)' },
  gridLegend: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 16 },
  legendLabel: { fontSize: 11, color: colors.mutedForeground, fontWeight: '700' },
  legendValue: { fontSize: 11, color: colors.mutedForeground, fontWeight: '800', marginLeft: 'auto' },
  milestonesList: { gap: 10 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.04)', gap: 14, ...shadows.soft },
  milestoneRowReached: { borderColor: 'rgba(255, 122, 0, 0.2)', backgroundColor: 'rgba(255, 122, 0, 0.01)' },
  milestoneIconBg: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  milestoneIconBgReached: { backgroundColor: 'rgba(255, 122, 0, 0.08)' },
  milestoneIconBgLocked: { backgroundColor: '#F8F9FA' },
  milestoneName: { fontSize: 14, fontWeight: '800', color: colors.foreground },
  milestoneTextReached: { color: '#E65C00' },
  milestoneDays: { fontSize: 11, color: colors.mutedForeground, fontWeight: '600', marginTop: 2 },
  badgeChecked: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FF7A00', alignItems: 'center', justifyContent: 'center' },
  milestoneLockedLabel: { fontSize: 11, color: colors.mutedForeground, fontWeight: '700' },
});
