import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  RefreshControl,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { useOfflineAuthUser } from '@/lib/offline-auth';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { colors, shadows, radius } from '@/constants/theme';
import { readJsonResponse } from '@/lib/api-debug';
import { analyticsEvents } from '@/lib/firebase';
import { FlashcardContentRenderer } from '@/components/flashcard-content-renderer';
import { addBreadcrumb, captureException } from '@/lib/errors';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ImageRefreshService } from '@/services/ImageRefreshService';
import { useQueryClient } from '@tanstack/react-query';
import { useToast, ToastOverlay } from '@/components/ui/ToastProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';

type Card = {
  card_id: string;
  question: string;
  answer: string;
  explanation?: string | null;
  difficulty?: string | null;
  image_url?: string | null;
  image_key?: string | null;
  notes_image_url?: string | null;
  notes_image_key?: string | null;
};

import { useDeck } from '@/hooks/useDeck';

export default function DeckDetailPage() {
  const { id, addCard } = useLocalSearchParams<{ id: string; addCard?: string }>();
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { offlineUserId } = useOfflineAuthUser();
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const { showToast, showConfirm } = useToast();
  const effectiveUserId = userId ?? offlineUserId;

  const { data, isLoading: loading, error: queryError, refetch } = useDeck(id);
  const error = queryError ? queryError.message : null;
  const deck = data?.deck || null;
  const cards = data?.cards || [];
  const fetchedAt = data?.fetchedAt || Date.now();
  
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - fetchedAt > 14 * 60 * 1000) {
        if (id) {
          ImageRefreshService.refreshUrls(id, cards, (updater) => {
            queryClient.setQueriesData({ queryKey: ['deck', id, effectiveUserId] }, (old: any) => {
              if (!old) return old;
              return { ...old, cards: updater(old.cards), fetchedAt: Date.now() };
            });
            return []; // Return dummy for typescript, setQueriesData modifies it in place
          }, getToken);
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchedAt, id, cards, getToken, queryClient, effectiveUserId]);

  const handleImageError = useCallback(() => {
    if (id) {
      ImageRefreshService.refreshUrls(id, cards, (updater) => {
        queryClient.setQueriesData({ queryKey: ['deck', id, effectiveUserId] }, (old: any) => {
          if (!old) return old;
          return { ...old, cards: updater(old.cards), fetchedAt: Date.now() };
        });
        return [];
      }, getToken);
    }
  }, [id, cards, getToken, queryClient, effectiveUserId]);
  const [imageUrl, setImageUrl] = useState('');
  const [notesImageUrl, setNotesImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingNotesImage, setUploadingNotesImage] = useState(false);

  // Add/Edit card modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newExplanation, setNewExplanation] = useState('');
  const [imageKey, setImageKey] = useState('');
  const [notesImageKey, setNotesImageKey] = useState('');
  const [creating, setCreating] = useState(false);

  // Expanded card
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  useEffect(() => {
    if (addCard === '1') openModal();
  }, [addCard, isOnline]);

  function openModal(card?: Card) {
    if (!isOnline) {
      showToast('Adding or editing cards needs internet. You can still review cached cards offline.', 'error');
      return;
    }

    // Pre-request gallery permission in the background so it's ready
    void ImagePicker.requestMediaLibraryPermissionsAsync();

    if (card) {
      setEditingCardId(card.card_id);
      setNewQuestion(card.question);
      setNewAnswer(card.answer);
      setNewExplanation(card.explanation || '');
      setImageUrl(card.image_url || '');
      setNotesImageUrl(card.notes_image_url || '');
      setImageKey(card.image_key || '');
      setNotesImageKey(card.notes_image_key || '');
    } else {
      setEditingCardId(null);
      setNewQuestion('');
      setNewAnswer('');
      setNewExplanation('');
      setImageUrl('');
      setNotesImageUrl('');
      setImageKey('');
      setNotesImageKey('');
    }
    setModalVisible(true);
  }

  async function pickAndUploadImage(forNotes: boolean) {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const selectedUri = result.assets[0].uri;
      const fileName = selectedUri.split('/').pop() || 'image.jpg';
      const mimeType = result.assets[0].mimeType || 'image/jpeg';

      if (forNotes) {
        setUploadingNotesImage(true);
      } else {
        setUploadingImage(true);
      }

      const token = await getToken();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      
      console.log(`[Image Upload] Target: ${forNotes ? 'notes' : 'question'}`);
      console.log(`[Image Upload] File selected: ${fileName} (${mimeType})`);

      const presignedRes = await fetch(`${apiUrl}/decks/${id}/images/upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: fileName,
          content_type: mimeType,
          target: forNotes ? 'notes' : 'question'
        }),
      });

      console.log(`[Image Upload] Presigned URL Response Status: ${presignedRes.status}`);

      if (!presignedRes.ok) {
        const errorText = await presignedRes.text();
        console.error(`[Image Upload] Failed to get authorization: ${errorText}`);
        throw new Error('Failed to get upload authorization');
      }

      const presignedData = await JSON.parse(await presignedRes.text());
      console.log(`[Image Upload] Presigned Data received, starting file upload to: ${presignedData.upload_url}`);

      // Use FileSystem upload (which natively supports file URIs)
      // uploadType 0 corresponds to FileSystemUploadType.BINARY_CONTENT
      const uploadResult = await FileSystem.uploadAsync(presignedData.upload_url, selectedUri, {
        httpMethod: 'PUT',
        uploadType: 0,
        headers: {
          'Content-Type': mimeType,
          ...(presignedData.headers || {})
        }
      });
      
      console.log(`[Image Upload] FileSystem.uploadAsync Result Status: ${uploadResult.status}`);
      if (uploadResult.status >= 400) {
        console.error(`[Image Upload] FileSystem upload failed body: ${uploadResult.body}`);
      }
      
      if (forNotes) setUploadingNotesImage(false);
      else setUploadingImage(false);

      if (uploadResult.status >= 200 && uploadResult.status < 300) {
        if (forNotes) {
          setNotesImageUrl(presignedData.file_url);
          setNotesImageKey(presignedData.image_key || '');
        } else {
          setImageUrl(presignedData.file_url);
          setImageKey(presignedData.image_key || '');
        }
      } else {
        showToast('Could not save the image.', 'error');
      }

    } catch (e: any) {
      console.error(`[Image Upload] Exception caught:`, e);
      if (forNotes) setUploadingNotesImage(false);
      else setUploadingImage(false);
      showToast(e.message || 'Image selection/upload failed.', 'error');
    }
  }

  const onRefresh = useCallback(async () => {
    if (!isOnline) {
      showToast('Deck refresh needs internet. Showing cached cards if available.', 'info');
      return;
    }

    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [isOnline, refetch]);

  async function handleSaveCard() {
    if (!newQuestion.trim() || !newAnswer.trim()) return;

    if (!isOnline) {
      // Offline edit / create
      const cardId = editingCardId || `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const newCard = {
        card_id: cardId,
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
        explanation: newExplanation.trim() || null,
        image_key: imageKey.trim() || null,
        notes_image_key: notesImageKey.trim() || null,
        sync_status: editingCardId ? 'PENDING_UPDATE' : 'PENDING_CREATE',
      };

      queryClient.setQueryData(['deck', id, effectiveUserId], (old: any) => {
        if (!old) return { deck: null, cards: [newCard], fetchedAt: Date.now() };
        let newCards = [...(old.cards || [])];
        if (editingCardId) {
          newCards = newCards.map(c => c.card_id === editingCardId ? { ...c, ...newCard } : c);
        } else {
          newCards.push(newCard);
        }
        return {
          ...old,
          cards: newCards,
        };
      });

      setModalVisible(false);
      setEditingCardId(null);
      setNewQuestion('');
      setNewAnswer('');
      setNewExplanation('');
      setImageUrl('');
      setNotesImageUrl('');
      setImageKey('');
      setNotesImageKey('');
      showToast(editingCardId ? 'Card updated locally (offline)' : 'Card added locally (offline)', 'success');
      return;
    }

    setCreating(true);
    try {
      const token = await getToken();
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      
      const body = JSON.stringify({ 
        question: newQuestion.trim(), 
        answer: newAnswer.trim(),
        explanation: newExplanation.trim() || null,
        image_key: imageKey.trim() || null,
        notes_image_key: notesImageKey.trim() || null,
      });

      let res;
      if (editingCardId) {
        res = await fetch(`${apiUrl}/decks/${id}/cards/${editingCardId}`, { method: 'PUT', headers, body });
      } else {
        res = await fetch(`${apiUrl}/decks/${id}/cards`, { method: 'POST', headers, body });
      }

      if (!res.ok) {
        const data = await readJsonResponse(res);
        throw new Error(data?.detail || `Could not ${editingCardId ? 'edit' : 'add'} card`);
      }

      setModalVisible(false);
      setEditingCardId(null);
      setNewQuestion('');
      setNewAnswer('');
      setNewExplanation('');
      setImageUrl('');
      setNotesImageUrl('');
      setImageKey('');
      setNotesImageKey('');
      await refetch();
    } catch (e: any) {
      captureException(e, {
        feature: 'deck',
        action: editingCardId ? 'edit_card' : 'add_card',
        extra: { deck_id: id },
      });
      showToast(e?.message ?? 'Could not save card', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteCard(cardId: string) {
    if (!isOnline) {
      queryClient.setQueryData(['deck', id, effectiveUserId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          cards: (old.cards || []).filter((c: any) => c.card_id !== cardId),
        };
      });
      showToast('Card deleted locally (offline)', 'success');
      return;
    }

    showConfirm({
      title: 'Delete this card?',
      message: 'This card will be permanently removed from the deck. This cannot be undone.',
      confirmLabel: 'Delete',
      icon: 'trash-2',
      onConfirm: async () => {
        try {
          const token = await getToken();
          const apiUrl = process.env.EXPO_PUBLIC_API_URL;
          const headers = { Authorization: `Bearer ${token}` };
          await fetch(`${apiUrl}/decks/${id}/cards/${cardId}`, { method: 'DELETE', headers });
          await refetch();
        } catch {
          captureException(new Error('Could not delete card'), {
            feature: 'deck',
            action: 'delete_card',
            extra: { deck_id: id, card_id: cardId },
          });
          showToast('Could not delete card', 'error');
        }
      },
    });
  }

  async function handleDeleteDeck() {
    if (!isOnline) {
      showToast('Deleting a deck needs internet.', 'error');
      return;
    }

    showConfirm({
      title: 'Delete this deck?',
      message: `"${deck?.title ?? 'This deck'}" and all its cards will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      icon: 'trash-2',
      onConfirm: async () => {
        try {
          const token = await getToken();
          const apiUrl = process.env.EXPO_PUBLIC_API_URL;
          const headers = { Authorization: `Bearer ${token}` };
          const res = await fetch(`${apiUrl}/decks/${id}`, { method: 'DELETE', headers });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.message || `Delete failed (${res.status})`);
          }
          queryClient.invalidateQueries({ queryKey: ['decks'] });
          router.replace('/decks');
        } catch {
          captureException(new Error('Could not delete deck'), {
            feature: 'deck',
            action: 'delete_deck',
            extra: { deck_id: id },
          });
          showToast('Could not delete deck', 'error');
        }
      },
    });
  }

  return (
    <View style={styles.root}>
      {/* ── Compact header ── */}
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </TouchableOpacity>

          <View style={styles.topCenter}>
            <Text style={styles.topTitle} numberOfLines={1}>
              {deck?.title ?? 'Deck'}
            </Text>
            <Text style={styles.topSub}>
              {loading ? '…' : `${cards.length} card${cards.length !== 1 ? 's' : ''}`}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => openModal()} style={styles.topAction} hitSlop={8}>
              <Feather name="plus" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteDeck} style={[styles.topAction, { backgroundColor: 'rgba(239,68,68,0.1)' }]} hitSlop={8}>
              <Feather name="trash-2" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>



      {/* ── Card list ── */}
      <ScrollView
        style={styles.scroll}
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
        {loading ? (
          <View style={{ gap: 10, paddingHorizontal: 20 }}>
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} style={{ height: 80, borderRadius: radius['2xl'], width: '100%' }} />
            ))}
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={() => refetch()} />
        ) : cards.length === 0 ? (
          <EmptyState 
            icon="inbox"
            title="No cards yet"
            description="Tap the + button to add your first flashcard."
            buttonText="Add Flashcard"
            onButtonPress={() => openModal()}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {cards.map((c, i) => {
              const open = expandedCard === c.card_id;
              return (
                <TouchableOpacity
                  key={c.card_id}
                  activeOpacity={0.85}
                  onPress={() => setExpandedCard(open ? null : c.card_id)}
                  style={[styles.cardRow, open && styles.cardRowOpen]}
                >
                  <View style={styles.cardNum}>
                    <Text style={styles.cardNumText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <FlashcardContentRenderer
                      content={c.question}
                      images={open && c.image_url ? [c.image_url] : []}
                      color={colors.foreground}
                      fontSize={16}
                      textStyle={{ fontWeight: '600', lineHeight: 24 }}
                      onImageError={handleImageError}
                    />
                    {open && (
                      <View style={styles.answerBlock}>
                        <Text style={styles.answerLabel}>ANSWER</Text>
                        <FlashcardContentRenderer content={c.answer} color={colors.foreground} fontSize={15} textStyle={{ lineHeight: 22 }} onImageError={handleImageError} />
                        {(c.explanation || c.notes_image_url) ? (
                          <>
                            <Text style={[styles.answerLabel, { marginTop: 8 }]}>EXPLANATION</Text>
                            <FlashcardContentRenderer
                              content={c.explanation || ''}
                              images={c.notes_image_url ? [c.notes_image_url] : []}
                              color={colors.mutedForeground}
                              fontSize={14}
                              textStyle={{ lineHeight: 20 }}
                              onImageError={handleImageError}
                            />
                          </>
                        ) : null}
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <Feather
                      name={open ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={colors.mutedForeground}
                    />
                    {open && (
                      <>
                        <TouchableOpacity
                          onPress={() => openModal(c)}
                          hitSlop={8}
                          style={styles.editBtn}
                        >
                          <Feather name="edit-2" size={13} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteCard(c.card_id)}
                          hitSlop={8}
                          style={styles.trashBtn}
                        >
                          <Feather name="trash-2" size={13} color="#fff" />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Sticky Bottom Review CTA ── */}
      {!loading && cards.length > 0 && (
        <View style={styles.bottomCtaWrap}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.reviewBtn}
            onPress={() => {
              addBreadcrumb('Study session started', { deck_id: id, card_count: cards.length }, 'study');
              void analyticsEvents.studyStarted(id, cards.length);
              router.push(`/review/${id}` as any);
            }}
          >
            <Feather name="play" size={18} color={colors.primaryForeground} />
            <Text style={styles.reviewBtnText}>Start Review</Text>
            <View style={styles.reviewBadge}>
              <Text style={styles.reviewBadgeText}>{cards.length}</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Add/Edit card modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingCardId ? 'Edit Card' : 'New Card'}</Text>
            <View style={{ gap: 12 }}>
              <Text style={styles.modalLabel}>QUESTION</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter question…"
                placeholderTextColor={colors.mutedForeground}
                value={newQuestion}
                onChangeText={setNewQuestion}
                multiline
                autoFocus
              />

              <Text style={styles.modalLabel}>QUESTION IMAGE (OPTIONAL)</Text>
              {imageUrl ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: imageUrl }} style={styles.imagePreview} resizeMode="contain" />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => setImageUrl('')}>
                    <Feather name="x" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.imageUploadBtn}
                  disabled={uploadingImage}
                  onPress={() => pickAndUploadImage(false)}
                >
                  {uploadingImage ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Feather name="image" size={15} color={colors.primary} />
                  )}
                  <Text style={styles.imageUploadText}>
                    {uploadingImage ? 'Uploading image…' : 'Add Question Image'}
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={styles.modalLabel}>ANSWER</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter answer…"
                placeholderTextColor={colors.mutedForeground}
                value={newAnswer}
                onChangeText={setNewAnswer}
                multiline
              />

              <Text style={styles.modalLabel}>EXPLANATION (OPTIONAL)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter explanation…"
                placeholderTextColor={colors.mutedForeground}
                value={newExplanation}
                onChangeText={setNewExplanation}
                multiline
              />

              <Text style={styles.modalLabel}>EXPLANATION IMAGE (OPTIONAL)</Text>
              {notesImageUrl ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: notesImageUrl }} style={styles.imagePreview} resizeMode="contain" />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => setNotesImageUrl('')}>
                    <Feather name="x" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.imageUploadBtn}
                  disabled={uploadingNotesImage}
                  onPress={() => pickAndUploadImage(true)}
                >
                  {uploadingNotesImage ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Feather name="image" size={15} color={colors.primary} />
                  )}
                  <Text style={styles.imageUploadText}>
                    {uploadingNotesImage ? 'Uploading image…' : 'Add Explanation Image'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setModalVisible(false);
                  setEditingCardId(null);
                  setNewQuestion('');
                  setNewAnswer('');
                  setNewExplanation('');
                  setImageUrl('');
                  setNotesImageUrl('');
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (!newQuestion.trim() || !newAnswer.trim() || creating) && { opacity: 0.5 }]}
                disabled={!newQuestion.trim() || !newAnswer.trim() || creating}
                onPress={handleSaveCard}
              >
                {creating ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={styles.confirmText}>{editingCardId ? 'Save' : 'Add Card'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <ToastOverlay />
      </Modal>
    </View>
  );
}

/* ───────────────── styles ───────────────── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  /* top bar */
  safeTop: { backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCenter: { flex: 1 },
  topTitle: { fontSize: 17, fontWeight: '800', color: colors.foreground },
  topSub: { fontSize: 12, color: colors.mutedForeground, marginTop: 1 },
  topAction: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(91,79,230,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* review CTA */
  ctaWrap: { paddingHorizontal: 20, paddingTop: 16 },
  reviewBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius['2xl'],
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...shadows.pop,
  },
  reviewBtnText: { color: colors.primaryForeground, fontWeight: '800', fontSize: 16 },
  reviewBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  reviewBadgeText: { fontSize: 12, fontWeight: '800', color: colors.primaryForeground },

  /* card list */
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 0 },
  cardRow: {
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: radius['2xl'],
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardRowOpen: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  cardNum: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardNumText: { fontSize: 11, fontWeight: '800', color: colors.mutedForeground },
  cardQ: { fontSize: 14, fontWeight: '600', color: colors.foreground, lineHeight: 20 },
  answerBlock: {
    marginTop: 8,
    backgroundColor: colors.muted,
    borderRadius: radius.xl,
    padding: 12,
  },
  answerLabel: { fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 1, marginBottom: 3 },
  answerText: { fontSize: 13, color: colors.foreground, lineHeight: 19 },
  editBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* shared */
  bottomCtaWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  errorBox: { backgroundColor: colors.card, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', gap: 12 },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius['2xl'] },
  retryText: { color: colors.primaryForeground, fontWeight: '700', fontSize: 13 },
  emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },

  /* modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  modalLabel: { fontSize: 10, fontWeight: '800', color: colors.mutedForeground, letterSpacing: 1 },
  modalInput: { backgroundColor: colors.muted, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: colors.foreground, minHeight: 60 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius['2xl'], paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontWeight: '700', color: colors.foreground },
  confirmBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius['2xl'], paddingVertical: 14, alignItems: 'center', ...shadows.pop },
  confirmText: { fontWeight: '800', color: colors.primaryForeground },
  cardImage: {
    width: '100%',
    height: 140,
    borderRadius: radius.xl,
    marginTop: 8,
    backgroundColor: colors.muted,
  },
  imageUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius['2xl'],
    paddingVertical: 12,
    backgroundColor: colors.muted,
  },
  imageUploadText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  imagePreviewContainer: {
    position: 'relative',
    width: 120,
    height: 80,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
