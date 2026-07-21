import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { useDecks } from '@/hooks/useDecks';
import { useQueryClient } from '@tanstack/react-query';

import { AuthenticatedShell } from '@/components/authenticated-shell';
import { colors, shadows, radius } from '@/constants/theme';
import { readJsonResponse } from '@/lib/api-debug';
import { analyticsEvents } from '@/lib/firebase';
import { addBreadcrumb, captureException } from '@/lib/errors';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useToast } from '@/components/ui/ToastProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';

const TINTS = ['#EEF2FF','#FFF7ED','#ECFEFF','#FFF1F2','#F0FDF4','#FEFCE8'];
const EMOJIS = ['📚','🧬','🏛️','⚛️','🌍','🎨','🔬','💡'];
function deckTint(i: number) { return TINTS[i % TINTS.length]; }
function deckEmoji(i: number) { return EMOJIS[i % EMOJIS.length]; }

type Deck = {
  deck_id: string;
  title: string;
  description?: string | null;
};

export default function DecksPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { isOnline } = useNetworkStatus();
  const { create: createParam } = useLocalSearchParams<{ create?: string }>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  
  const { data: decksData = [], isLoading: loading, error: queryError, refetch } = useDecks();
  const decks: Deck[] = decksData;
  const error = queryError ? queryError.message : null;
  
  const [creating, setCreating] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (createParam === '1') setModalVisible(true);
  }, [createParam]);

  const onRefresh = useCallback(async () => {
    if (!isOnline) {
      showToast('Deck refresh needs internet. Showing cached decks if available.', 'info');
      return;
    }

    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [isOnline, refetch]);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    if (!isOnline) {
      showToast('Creating a new deck needs internet. You can review cached decks while offline.', 'error');
      return;
    }

    setCreating(true);
    try {
      const token = await getToken();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      
      const response = await fetch(`${apiUrl}/decks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: newTitle.trim(), description: 'Manually created deck' })
      });
      
      if (!response.ok) {
        const data = await readJsonResponse(response);
        throw new Error(data?.message || 'Could not create deck');
      }

      setModalVisible(false); 
      setNewTitle('');
      addBreadcrumb('Create deck completed', { source: 'manual' }, 'deck');
      await analyticsEvents.createDeck(undefined, 'manual');
      queryClient.invalidateQueries({ queryKey: ['decks'] });
    } catch (e: any) {
      captureException(e, { feature: 'deck', action: 'create_deck' });
      showToast(e?.message ?? 'Could not create deck', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <AuthenticatedShell
      title="My Decks"
      subtitle={loading ? 'Loading…' : `${decks.length} active deck${decks.length !== 1 ? 's' : ''}`}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      <View style={styles.body}>
        {loading ? (
          <View style={{ gap: 12 }}>
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} style={{ height: 96, borderRadius: radius['3xl'], width: '100%' }} />
            ))}
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={() => refetch()} />
        ) : decks.length === 0 ? (
          <EmptyState 
            icon="folder-plus"
            title="No decks yet"
            description="Upload content or notes to auto-generate a deck."
            buttonText="Create Deck"
            onButtonPress={() => setModalVisible(true)}
          />
        ) : (
          <View style={{ gap: 12 }}>
            {decks.map((d: Deck, i: number) => (
              <View key={d.deck_id} style={styles.row} testID={`deck-row-${d.deck_id}`}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push(`/deck/${d.deck_id}` as any)}
                  style={styles.rowMain}
                >
                  <View style={[styles.emoji, { backgroundColor: deckTint(i) }]}>
                    <Text style={{ fontSize: 24 }}>{deckEmoji(i)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>{d.title}</Text>
                    {d.description ? <Text style={styles.meta} numberOfLines={1}>{d.description}</Text> : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`deck-add-card-${d.deck_id}`}
                  onPress={() => {
                    if (!isOnline) {
                      showToast('Adding cards needs internet. Review cached cards while offline.', 'error');
                      return;
                    }
                    router.push(`/deck/${d.deck_id}?addCard=1` as any);
                  }}
                  style={styles.deckIconBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="plus" size={14} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`deck-edit-deck-${d.deck_id}`}
                  onPress={() => router.push(`/deck/${d.deck_id}` as any)}
                  style={styles.editDeckBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.editDeckBtnText}>Edit deck</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Deck</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Deck title…"
              placeholderTextColor={colors.mutedForeground}
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalVisible(false); setNewTitle(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (!newTitle.trim() || creating) && { opacity: 0.5 }]}
                disabled={!newTitle.trim() || creating || !isOnline}
                onPress={handleCreate}
              >
                {creating ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Text style={styles.confirmText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AuthenticatedShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, marginTop: 12, gap: 16 },
  createBtn: { backgroundColor: colors.primary, borderRadius: radius['2xl'], paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.pop },
  createBtnText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 14 },
  row: { backgroundColor: colors.card, padding: 16, borderRadius: radius['3xl'], flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, ...shadows.soft },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 },
  deckIconBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editDeckBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
  },
  editDeckBtnText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  emoji: { width: 56, height: 56, borderRadius: radius['2xl'], alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  meta: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
  errorBox: { backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', gap: 12 },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius['2xl'] },
  retryText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 13 },
  emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  modalInput: { backgroundColor: colors.muted, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.foreground },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius['2xl'], paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontWeight: '700', color: colors.foreground },
  confirmBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius['2xl'], paddingVertical: 14, alignItems: 'center', ...shadows.pop },
  confirmText: { fontWeight: '800', color: colors.primaryForeground },
});
