import React, { useCallback, useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { AuthenticatedShell } from '@/components/authenticated-shell';
import { colors, shadows, radius } from '@/constants/theme';
import { useStats, EMPTY_STATS, useStudyStreak } from '@/hooks/useStats';

export default function StatsScreen() {
  const { data: stats = EMPTY_STATS, isLoading: statsLoading, error: queryError, refetch } = useStats();
  const { data: streakData, isLoading: streakLoading, refetch: refetchStreak } = useStudyStreak();
  const error = queryError ? queryError.message : null;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchStreak()]);
    setRefreshing(false);
  }, [refetch, refetchStreak]);

  const streakValue = stats.current_streak || 0;
  const streak = streakData?.current_streak ?? streakValue;
  const loading = statsLoading;

  const weekly = stats.weekly.length === 7 ? stats.weekly : EMPTY_STATS.weekly;
  const max = Math.max(...weekly, 1);
  const weeklyTotal = weekly.reduce((a, b) => a + b, 0);

  const getDayLabel = (index: number) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return dayNames[date.getDay()];
  };

  return (
    <AuthenticatedShell
      title="Your Stats"
      subtitle="Keep the streak alive"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.grid}>
          <Metric
            icon={<MaterialCommunityIcons name="fire" size={14} color={colors.primary} />}
            label="Current streak"
            value={`${streak} days`}
            accent
          />
          <Metric
            icon={<Feather name="award" size={14} color={colors.mutedForeground} />}
            label="Longest streak"
            value={`${stats.longest_streak} days`}
            accent={streak > 0 && streak === stats.longest_streak}
          />
          <Metric
            icon={<Feather name="book-open" size={14} color={colors.mutedForeground} />}
            label="Cards reviewed"
            value={stats.cards_reviewed_total.toLocaleString()}
          />
          <Metric
            icon={<Feather name="calendar" size={14} color={colors.mutedForeground} />}
            label="Study days"
            value={stats.study_days}
          />
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHead}>
            <Text style={styles.chartTitle}>This week</Text>
            <Text style={styles.chartMeta}>{weeklyTotal} cards</Text>
          </View>
          <View style={styles.chart}>
            {weekly.map((v, i) => (
              <View key={i} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${Math.max((v / max) * 100, 3)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{getDayLabel(i)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.fireCard}>
          <Text style={styles.fireTitle}>Keep it going!</Text>
          <Text style={styles.fireText}>
            {stats.cards_reviewed_today} cards reviewed today. Keep it going to extend your streak.
          </Text>
        </View>
      </View>
    </AuthenticatedShell>
  );
}

function Metric({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <View style={styles.metric} testID={`metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <View style={styles.metricHead}>
        {icon}
        <Text
          style={[
            styles.metricLabel,
            { color: accent ? colors.primary : colors.mutedForeground },
          ]}
        >
          {label.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, marginTop: 12, gap: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  metricHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  metricValue: { fontSize: 22, fontWeight: '800', color: colors.foreground, marginTop: 6 },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  chartHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: { fontSize: 16, fontWeight: '800', color: colors.foreground },
  chartMeta: { fontSize: 11, fontWeight: '700', color: colors.mutedForeground },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 160 },
  barCol: { flex: 1, alignItems: 'center', gap: 8, height: '100%' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: {
    width: '100%',
    backgroundColor: colors.primary,
    opacity: 0.8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  barLabel: { fontSize: 10, fontWeight: '800', color: colors.mutedForeground },
  fireCard: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius['3xl'],
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fireTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  fireText: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },
  errorBox: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius['2xl'] },
  retryText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 13 },
});
