import { AuthenticatedShell } from '@/components/authenticated-shell'
import { colors, radius, shadows } from '@/constants/theme'
import { readJsonResponse } from '@/lib/api-debug'
import { addBreadcrumb, captureException } from '@/lib/errors'
import { analyticsEvents } from '@/lib/firebase'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useAuth } from '@clerk/clerk-expo'
import { useQueryClient } from '@tanstack/react-query'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useToast } from '@/components/ui/ToastProvider'
import { useRef, useState } from 'react'
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

const STATUS_POLL_INTERVAL_MS = 3000
const STATUS_POLL_TIMEOUT_MS = 15_000
const FOREGROUND_WAIT_LIMIT_MS = 10 * 60_000

type GenerationState =
  | { status: 'IDLE'; message: string }
  | { status: 'RUNNING'; message: string; generationId?: string }
  | { status: 'FAILED'; message: string; code?: string }
  | { status: 'SUCCESS'; message: string }

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30_000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function isValidYoutubeUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function getErrorDetail(data: any, fallback: string) {
  if (typeof data?.detail === 'string') return data.detail
  if (typeof data?.detail?.message === 'string') return data.detail.message
  if (typeof data?.message === 'string') return data.message
  return fallback
}

function getStageMessage(stage?: string, progress?: number) {
  const pct = typeof progress === 'number' && progress > 0 ? ` ${progress}%` : ''
  switch (String(stage || '').toUpperCase()) {
    case 'EXTRACTING_TRANSCRIPT':
      return `Extracting transcript...${pct}`
    case 'PROCESSING_TRANSCRIPT':
      return `Processing transcript...${pct}`
    case 'SUMMARIZING':
      return `Summarizing video content...${pct}`
    case 'GENERATING_CARDS':
      return `Generating flashcards...${pct}`
    case 'CREATING_DECK':
      return `Creating deck...${pct}`
    case 'COMPLETED':
      return 'Flashcards are ready.'
    default:
      return `Starting generation...${pct}`
  }
}

export default function CreateYoutubePage() {
  const router = useRouter()
  const { getToken } = useAuth()
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const sliderWidthRef = useRef(0)
  const [url, setUrl] = useState('')
  const [cardLimit, setCardLimit] = useState(10)
  const [state, setState] = useState<GenerationState>({ status: 'IDLE', message: '' })
  const [isSliding, setIsSliding] = useState(false)

  const ready = isValidYoutubeUrl(url)
  const running = state.status === 'RUNNING'

  const handleSliderTouch = (event: any) => {
    const x = event.nativeEvent.locationX
    const width = sliderWidthRef.current || 200
    const ratio = Math.max(0, Math.min(1, x / width))
    setCardLimit(Math.round(5 + ratio * 25))
  }

  const watchGeneration = async (generationId: string, token: string, apiUrl: string) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < FOREGROUND_WAIT_LIMIT_MS) {
      await delay(STATUS_POLL_INTERVAL_MS)
      const response = await fetchWithTimeout(`${apiUrl}/youtube/generation/${generationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, STATUS_POLL_TIMEOUT_MS)
      const data = await readJsonResponse(response)
      if (!response.ok) {
        throw new Error(getErrorDetail(data, 'Could not check YouTube generation status.'))
      }

      setState({
        status: 'RUNNING',
        generationId,
        message: getStageMessage(data.stage, data.progress),
      })

      if (data.status === 'completed') return data
      if (data.status === 'failed') {
        const error = new Error(data.error?.message || 'YouTube generation failed.') as Error & { code?: string; statusData?: any }
        error.code = data.error?.code
        error.statusData = data
        throw error
      }
    }
    throw new Error('Generation is still running. Please check your decks again shortly.')
  }

  const handleGenerate = async () => {
    if (!ready || running) return
    if (!isOnline) {
      showToast('Creating flashcards from YouTube needs internet.', 'error')
      return
    }

    let generationId: string | undefined
    try {
      setState({ status: 'RUNNING', message: 'Submitting YouTube URL...' })
      await analyticsEvents.youtubeUrlSubmitted()

      const token = await getToken()
      const apiUrl = process.env.EXPO_PUBLIC_API_URL
      if (!token || !apiUrl) {
        throw new Error('Missing API URL or auth token.')
      }

      const response = await fetchWithTimeout(`${apiUrl}/youtube/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
          num_cards: cardLimit,
        }),
      })
      const data = await readJsonResponse(response)
      if (!response.ok) {
        throw new Error(getErrorDetail(data, 'Failed to start YouTube generation.'))
      }

      generationId = data.generation_id
      if (!generationId) {
        throw new Error('Generation started but no generation id was returned.')
      }

      const activeGenerationId = generationId
      setState({ status: 'RUNNING', generationId: activeGenerationId, message: 'Extracting transcript...' })
      await analyticsEvents.youtubeGenerationStarted(activeGenerationId, cardLimit)
      addBreadcrumb('YouTube generation started', { generation_id: activeGenerationId }, 'ai')

      const finalStatus = await watchGeneration(activeGenerationId, token, apiUrl)
      setState({ status: 'SUCCESS', message: 'Flashcards are ready.' })
      await analyticsEvents.youtubeGenerationCompleted({
        generationId: activeGenerationId,
        transcriptLength: finalStatus.transcript_length,
        providerUsed: finalStatus.provider_used,
        cardsGenerated: finalStatus.cards_generated,
        generationDuration: finalStatus.generation_duration_ms,
        providerCallCount: finalStatus.provider_call_count,
      })
      await analyticsEvents.youtubeGenerationDuration(activeGenerationId, finalStatus.generation_duration_ms)
      await analyticsEvents.generateDeckAi('youtube', finalStatus.cards_generated)
      await analyticsEvents.flashcardsCreatedFromYoutube(finalStatus.deck_id, finalStatus.cards_generated)
      await analyticsEvents.deckOpenedFromYoutubeGeneration(finalStatus.deck_id, activeGenerationId)
      showToast(`${finalStatus.cards_generated || cardLimit} flashcards created from YouTube.`, 'success')
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      router.push(finalStatus.deck_id ? (`/deck/${finalStatus.deck_id}` as any) : '/decks')
    } catch (error) {
      const statusData = error instanceof Error ? (error as Error & { statusData?: any }).statusData : undefined
      const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined
      const message = error instanceof Error ? error.message : String(error)
      setState({ status: 'FAILED', message, code })
      captureException(error, {
        feature: 'youtube_generation',
        action: 'generate_from_youtube',
        extra: {
          generation_id: generationId,
          requested_card_count: cardLimit,
          error_code: code,
        },
      })
      await analyticsEvents.youtubeGenerationFailed({
        generationId,
        errorCode: code,
        generationDuration: statusData?.generation_duration_ms,
        providerUsed: statusData?.provider_used,
      })
      showToast(message, 'error')
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AuthenticatedShell title="Create From YouTube" subtitle="Turn videos into flashcards" scrollEnabled={!isSliding}>
        <View style={styles.body}>
          <View style={styles.inputCard}>
            <Text style={styles.label}>YOUTUBE URL</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://youtu.be/..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, url && !ready ? styles.inputError : null]}
            />
            {url && !ready ? <Text style={styles.errorText}>Enter a youtube.com or youtu.be link.</Text> : null}
          </View>

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

          {state.message ? (
            <View style={state.status === 'FAILED' ? styles.failureCard : styles.statusCard}>
              {running ? <ActivityIndicator color={colors.primary} size="small" /> : null}
              <Text style={state.status === 'FAILED' ? styles.failureText : styles.statusText}>{state.message}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            disabled={!ready || running || !isOnline}
            onPress={handleGenerate}
            activeOpacity={ready && !running && isOnline ? 0.85 : 1}
            style={[styles.generate, (!ready || running || !isOnline) && styles.generateDisabled]}
          >
            {running ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <MaterialCommunityIcons
                name="youtube"
                size={18}
                color={ready && isOnline ? colors.primaryForeground : colors.mutedForeground}
              />
            )}
            <Text style={[styles.generateText, { color: ready && !running && isOnline ? colors.primaryForeground : colors.mutedForeground }]}>
              {running ? 'Processing...' : isOnline ? 'Generate Flashcards' : 'Connect to Generate'}
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
    borderRadius: radius['2xl'],
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    ...shadows.soft,
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
  inputError: { borderColor: colors.danger },
  errorText: { fontSize: 12, color: colors.danger, fontWeight: '700' },
  sliderCard: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    ...shadows.soft,
  },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sliderTitle: { fontSize: 10, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  sliderValueBadge: {
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sliderValueText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  sliderBarContainer: { height: 36, justifyContent: 'center', position: 'relative' },
  sliderTrack: { height: 6, backgroundColor: colors.muted, borderRadius: 3, width: '100%' },
  sliderFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3, position: 'absolute', left: 0 },
  sliderKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: colors.primary,
    position: 'absolute',
    marginTop: -7,
    marginLeft: -10,
    ...shadows.soft,
  },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderLimitLabel: { fontSize: 10, fontWeight: '600', color: colors.mutedForeground },
  statusCard: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  statusText: { textAlign: 'center', fontSize: 13, color: colors.primary, fontWeight: '700' },
  failureCard: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.06)',
    padding: 14,
  },
  failureText: { textAlign: 'center', fontSize: 13, color: colors.danger, fontWeight: '700' },
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
  generateDisabled: { backgroundColor: colors.muted, shadowOpacity: 0, elevation: 0 },
  generateText: { fontSize: 15, fontWeight: '800' },
})
