import { AuthenticatedShell } from '@/components/authenticated-shell'
import { useAuth } from '@clerk/clerk-expo'
import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState, useRef } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons'
import { colors, radius, shadows } from '@/constants/theme'
import { readJsonResponse } from '@/lib/api-debug'
import { analyticsEvents } from '@/lib/firebase'
import { addBreadcrumb, captureException } from '@/lib/errors'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useToast } from '@/components/ui/ToastProvider'

export default function CreateNotesPage() {
  const router = useRouter()
  const { getToken } = useAuth()
  const { isOnline } = useNetworkStatus()
  const { showToast } = useToast()
  const { limit } = useLocalSearchParams<{ limit?: string }>()
  const queryClient = useQueryClient()
  
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [isSliding, setIsSliding] = useState(false)
  const [cardLimit, setCardLimit] = useState(limit ? parseInt(limit, 10) : 10)
  
  const sliderWidthRef = useRef(0)
  const ready = notes.length > 10

  const handleSliderTouch = (event: any) => {
    const x = event.nativeEvent.locationX
    const width = sliderWidthRef.current || 200
    const ratio = Math.max(0, Math.min(1, x / width))
    const val = Math.round(5 + ratio * 25)
    setCardLimit(val)
  }

  const handleGenerate = async () => {
    if (!ready) return

    if (!isOnline) {
      showToast('AI flashcard generation from notes needs internet. You can review cached decks while offline.', 'error')
      return
    }

    try {
      setUploading(true)
      setStatus('Generating flashcards from notes… (this may take ~30s)')
      const token = await getToken()
      const apiUrl = process.env.EXPO_PUBLIC_API_URL

      if (!token || !apiUrl) {
        throw new Error('Missing API URL or auth token.')
      }

      const response = await fetch(`${apiUrl}/uploads/process-notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim() || undefined,
          notes: notes.trim(),
          num_cards: cardLimit,
        }),
      })

      const data = await readJsonResponse(response)

      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to create deck.')
      }

      setStatus('')
      addBreadcrumb('Generate AI deck completed', {
        source: 'notes',
        card_count: data?.meta?.cardsGenerated || cardLimit,
      }, 'ai')
      await analyticsEvents.generateDeckAi('notes', data?.meta?.cardsGenerated || cardLimit)
      addBreadcrumb('Create deck completed', { source: 'notes_ai' }, 'deck')
      await analyticsEvents.createDeck(undefined, 'notes_ai')
      showToast('Deck generated from notes!', 'success')
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      router.push('/decks')
    } catch (error) {
      setStatus('')
      captureException(error, {
        feature: 'ai_deck_generation',
        action: 'generate_from_notes',
        extra: {
          note_length: notes.length,
          requested_card_count: cardLimit,
          has_custom_title: Boolean(title.trim()),
        },
      })
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AuthenticatedShell
        title="Upload"
        subtitle="Turn your notes into flashcards"
        scrollEnabled={!isSliding}
      >
        <View style={styles.body}>
          {/* Input area */}
          <View style={styles.inputCard}>
            <View style={{ gap: 12 }}>
              <Text style={styles.label}>DECK TITLE (OPTIONAL)</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Biology Chapter 1"
                placeholderTextColor={colors.mutedForeground}
                style={styles.input}
              />
            </View>

            <View style={{ gap: 12, marginTop: 16 }}>
              <Text style={styles.label}>PASTE YOUR NOTES</Text>
              <TextInput
                testID="notes-input"
                value={notes}
                onChangeText={setNotes}
                placeholder="Paste lecture notes, study material, or anything you want to remember…"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.textarea]}
                multiline
                textAlignVertical="top"
              />
              <Text style={[styles.help, { textAlign: 'right' }]}>{notes.length} chars</Text>
            </View>
          </View>

          {/* Flashcards limit slider in notes section */}
          <View style={styles.sliderCard}>
            <View style={styles.sliderHead}>
              <View style={styles.sliderTitleWrap}>
                <Feather name="sliders" size={13} color={colors.primary} />
                <Text style={styles.sliderTitle}>FLASHCARDS TO GENERATE</Text>
              </View>
              <View style={styles.sliderValueBadge}>
                <Text style={styles.sliderValueText}>{cardLimit} cards</Text>
              </View>
            </View>

            <View
              style={styles.sliderBarContainer}
              onLayout={(e) => { sliderWidthRef.current = e.nativeEvent.layout.width }}
              onStartShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                setIsSliding(true)
                handleSliderTouch(e)
              }}
              onResponderMove={handleSliderTouch}
              onResponderRelease={() => setIsSliding(false)}
              onResponderTerminate={() => setIsSliding(false)}
            >
              <View style={styles.sliderTrack} pointerEvents="none" />
              <View style={[styles.sliderFill, { width: `${((cardLimit - 5) / 25) * 100}%` }]} pointerEvents="none" />
              <View style={[styles.sliderKnob, { left: `${((cardLimit - 5) / 25) * 100}%` }]} pointerEvents="none" />
            </View>

            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLimitLabel}>Min: 5</Text>
              <Text style={[styles.sliderLimitLabel, { color: colors.primary, fontWeight: '700' }]}>Default: 10</Text>
              <Text style={styles.sliderLimitLabel}>Max: 30</Text>
            </View>
          </View>

          {/* Status text */}
          {status ? (
            <Text style={styles.statusText}>{status}</Text>
          ) : null}

          {/* Generate button */}
          <TouchableOpacity
            testID="generate-btn"
            disabled={!ready || uploading || !isOnline}
            onPress={handleGenerate}
            activeOpacity={ready && !uploading && isOnline ? 0.85 : 1}
            style={[
              styles.generate,
              (!ready || uploading || !isOnline) && styles.generateDisabled,
            ]}
          >
            {uploading ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <MaterialCommunityIcons
                name="creation"
                size={18}
                color={ready && isOnline ? colors.primaryForeground : colors.mutedForeground}
              />
            )}
            <Text
              style={[
                styles.generateText,
                { color: ready && !uploading && isOnline ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {uploading ? 'Processing...' : isOnline ? 'Generate Flashcards' : 'Connect to Generate'}
            </Text>
          </TouchableOpacity>
        </View>
      </AuthenticatedShell>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, marginTop: 12, gap: 24 },
  inputCard: {
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 260,
    ...shadows.soft,
  },
  /* Slider styles matching standard dashboard cards */
  sliderCard: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
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
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.mutedForeground,
    letterSpacing: 1,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius['2xl'],
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.foreground,
  },
  textarea: { minHeight: 160 },
  help: { fontSize: 12, color: colors.mutedForeground },
  statusText: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  generate: {
    paddingVertical: 16,
    borderRadius: radius['2xl'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    ...shadows.pop,
  },
  generateDisabled: {
    backgroundColor: colors.muted,
    shadowOpacity: 0,
    elevation: 0,
  },
  generateText: { fontSize: 15, fontWeight: '800' },
})
