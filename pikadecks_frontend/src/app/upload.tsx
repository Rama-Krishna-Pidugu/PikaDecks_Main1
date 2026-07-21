import { useCallback, useEffect, useState, useRef } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  RefreshControl,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { useAuth } from '@clerk/clerk-expo'
import { AuthenticatedShell } from '@/components/authenticated-shell'
import { colors, radius, shadows } from '@/constants/theme'
import { readJsonResponse } from '@/lib/api-debug'
import { pikaAssets } from '@/constants/assets'
import { analyticsEvents } from '@/lib/firebase'
import { addBreadcrumb, captureException } from '@/lib/errors'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/ToastProvider'

const MAX_PDF_SIZE_BYTES = 30 * 1024 * 1024
const DAILY_GENERATION_LIMIT = 10
const PRESIGNED_TIMEOUT_MS = 20_000
const PDF_UPLOAD_TIMEOUT_MS = 75_000
const QUEUE_TIMEOUT_MS = 20_000
const STATUS_POLL_TIMEOUT_MS = 15_000
const STATUS_POLL_INTERVAL_MS = 3_000
const PROCESSING_FOREGROUND_WAIT_LIMIT_MS = 10 * 60_000
const LONG_PROCESSING_NOTICE_MS = 30_000
const BACKGROUND_PROCESSING_MESSAGE =
  'Flashcard generation is still running. We will notify you when your cards are ready.'
const BACKGROUND_CHECK_MESSAGE =
  'We could not check progress right now. Flashcard generation is still running in the background.'

function getDeviceTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

type UploadState =
  | { status: 'IDLE'; message: string }
  | { status: 'UPLOADING'; message: string }
  | { status: 'SUCCESS'; message: string }
  | { status: 'FAILED'; message: string; code?: string }
  | { status: 'CANCELLED'; message: string }
  | { status: 'BACKGROUND'; message: string }

type ActiveUpload = {
  cancel: () => void
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 30_000
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out. Please check your internet connection.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isBackgroundProcessingMessage(message: string) {
  return message === BACKGROUND_PROCESSING_MESSAGE || message === BACKGROUND_CHECK_MESSAGE
}

function isLikelyProgressCheckError(message: string) {
  const lower = message.toLowerCase()
  return (
    lower.includes('network') ||
    lower.includes('timed out') ||
    lower.includes('could not check') ||
    lower.includes('missing api credentials') ||
    lower.includes('missing api url') ||
    lower.includes('auth token')
  )
}

function isLargePdfError(code?: string, message?: string) {
  const lower = (message || '').toLowerCase()
  return code === 'PREMIUM_REQUIRED' || lower.includes('free plan supports pdfs up to 150 pages')
}

function getFailureTitle(state: UploadState) {
  if (state.status === 'CANCELLED') return 'Upload Cancelled'
  if (state.status !== 'FAILED') return 'Upload Failed'
  if (state.code === 'PREMIUM_REQUIRED') return 'Large PDF Detected'
  if (state.code === 'LLM_RATE_LIMIT' || state.code === 'AI_RATE_LIMITED') return 'AI Busy'
  if (state.code === 'NO_VALID_CARDS') return 'Could Not Generate Cards'
  return 'Upload Failed'
}

export default function PDFUploadPage() {
  const router = useRouter()
  const { getToken } = useAuth()
  const { limit, uploadId: routeUploadId } = useLocalSearchParams<{ limit?: string; uploadId?: string }>()
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const { showToast, showInfo } = useToast()

  const [selectedFile, setSelectedFile] = useState<{
    uri: string
    name: string
    size?: number
    mimeType?: string
  } | null>(null)

  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'IDLE',
    message: '',
  })
  const [cardLimit, setCardLimit] = useState(limit ? parseInt(limit, 10) : 10)
  const [usage, setUsage] = useState({
    used: 0,
    limit: DAILY_GENERATION_LIMIT as number | null,
    remaining: DAILY_GENERATION_LIMIT as number | null,
    unlimited: false,
    plan: 'free',
    resetsAt: '',
    timezone: getDeviceTimezone(),
  })
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [isSliding, setIsSliding] = useState(false)

  const sliderWidthRef = useRef(0)
  const activeUploadRef = useRef<ActiveUpload | null>(null)
  const pickingDocumentRef = useRef(false)
  const resumedUploadRef = useRef<string | null>(null)
  const uploading = uploadState.status === 'UPLOADING'
  const status = uploadState.message

  useEffect(() => {
    if (!isOnline && uploading) {
      activeUploadRef.current?.cancel()
      activeUploadRef.current = null
      if (activeUploadId) {
        setUploadState({
          status: 'BACKGROUND',
          message: BACKGROUND_PROCESSING_MESSAGE,
        })
      } else {
        setUploadState({
          status: 'FAILED',
          message: 'Upload failed. No internet connection.',
        })
      }
    }
  }, [activeUploadId, isOnline, uploading])

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'Unknown size'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getErrorDetail = (data: any, fallback: string) => {
    if (typeof data?.detail === 'string') return data.detail
    if (typeof data?.detail?.message === 'string') return data.detail.message
    if (typeof data?.message === 'string') return data.message
    return fallback
  }

  const getLocalResetLabel = () => {
    if (usage.unlimited) return 'Unlimited with Pro'
    if (!usage.resetsAt) return 'Resets every 24 hours'
    const resetDate = new Date(usage.resetsAt)
    if (Number.isNaN(resetDate.getTime())) return 'Resets every 24 hours'
    return `Resets at ${resetDate.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })} local time`
  }

  const showUsageResetInfo = () => {
    showInfo({
      title: 'AI PDF generations',
      message: usage.unlimited
        ? 'You have unlimited AI PDF generations with Pro.'
        : `${usage.remaining}/${usage.limit} left in this 24-hour window.\n\n${getLocalResetLabel()}.`,
      action: { label: 'Pro details', onPress: () => router.push('/billing' as any) }
    })
  }

  const loadUsage = async () => {
    try {
      const token = await getToken()
      const apiUrl = process.env.EXPO_PUBLIC_API_URL
      if (!token || !apiUrl) return

      const timezone = getDeviceTimezone()
      const res = await fetchWithTimeout(`${apiUrl}/uploads/usage?timezone=${encodeURIComponent(timezone)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, 15_000)
      const data = await readJsonResponse(res)
      if (res.ok && data?.usage) {
        setUsage(data.usage)
      }
    } catch {
      // Keep the optimistic local default if usage cannot be loaded.
    }
  }

  const checkActiveUpload = useCallback(async () => {
    if (!isOnline) return null
    const token = await getToken()
    const apiUrl = process.env.EXPO_PUBLIC_API_URL
    if (!token || !apiUrl) return null

    const response = await fetchWithTimeout(`${apiUrl}/uploads/active`, {
      headers: { Authorization: `Bearer ${token}` },
    }, STATUS_POLL_TIMEOUT_MS)
    const data = await readJsonResponse(response)
    return response.ok ? data?.upload || null : null
  }, [getToken, isOnline])

  useEffect(() => {
    void loadUsage()
  }, [])

  useEffect(() => {
    if (routeUploadId || selectedFile || uploading || activeUploadId) {
      return
    }

    let cancelled = false
    const discoverActiveUpload = async () => {
      try {
        const upload = await checkActiveUpload()
        const uploadId = upload?.upload_id
        if (!cancelled && uploadId) {
          setActiveUploadId(uploadId)
          setUploadState({
            status: 'BACKGROUND',
            message: BACKGROUND_PROCESSING_MESSAGE,
          })
        }
      } catch {
        // Upload screen should still be usable if active-job discovery fails.
      }
    }

    void discoverActiveUpload()
    return () => {
      cancelled = true
    }
  }, [activeUploadId, checkActiveUpload, routeUploadId, selectedFile, uploading])

  useEffect(() => {
    if (!routeUploadId || resumedUploadRef.current === routeUploadId) {
      return
    }

    resumedUploadRef.current = routeUploadId
    void resumeUploadProgress(routeUploadId, { quietBackgroundAlert: true })
  }, [routeUploadId])

  const pickDocument = async () => {
    if (pickingDocumentRef.current || uploading) {
      return
    }

    pickingDocumentRef.current = true
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0]
        if (file.name.toLowerCase().endsWith('.pdf') || file.mimeType === 'application/pdf') {
          if (file.size && file.size > MAX_PDF_SIZE_BYTES) {
            showToast('Please choose a PDF smaller than 30 MB.', 'error')
            return
          }

          setSelectedFile({
            uri: file.uri,
            name: file.name,
            size: file.size,
            mimeType: file.mimeType || 'application/pdf',
          })
        } else {
          showToast('Please select a PDF document.', 'error')
        }
      }
    } catch (err) {
      console.error('Error picking document:', err)
      const message = err instanceof Error ? err.message : String(err)
      if (!message.toLowerCase().includes('different document picking in progress')) {
        showToast('Failed to pick document.', 'error')
      }
    } finally {
      pickingDocumentRef.current = false
    }
  }

  const handleSliderTouch = (event: any) => {
    const x = event.nativeEvent.locationX
    const width = sliderWidthRef.current || 200
    const ratio = Math.max(0, Math.min(1, x / width))
    const val = Math.round(5 + ratio * 25)
    setCardLimit(val)
  }

  const watchUploadProgress = async (uploadId: string, apiUrl: string) => {
    let cancelled = false
    activeUploadRef.current = {
      cancel: () => {
        cancelled = true
      },
    }

    let finalStatus: any = null
    const startedWaitingAt = Date.now()
    let longProcessingNoticeShown = false

    while (Date.now() - startedWaitingAt < PROCESSING_FOREGROUND_WAIT_LIMIT_MS) {
      if (cancelled) {
        throw new Error(BACKGROUND_PROCESSING_MESSAGE)
      }

      await delay(STATUS_POLL_INTERVAL_MS)

      if (!isOnline) {
        throw new Error(BACKGROUND_PROCESSING_MESSAGE)
      }

      let statusData: any = null
      try {
        const pollToken = await getToken({ skipCache: true })
        if (!pollToken) {
          throw new Error(BACKGROUND_PROCESSING_MESSAGE)
        }

        const statusRes = await fetchWithTimeout(`${apiUrl}/uploads/${uploadId}/status`, {
          headers: {
            Authorization: `Bearer ${pollToken}`,
          },
        }, STATUS_POLL_TIMEOUT_MS)

        statusData = await readJsonResponse(statusRes)
        if (statusRes.status === 401) {
          throw new Error(BACKGROUND_PROCESSING_MESSAGE)
        }
        if (!statusRes.ok) {
          throw new Error(getErrorDetail(statusData, 'Could not check generation status.'))
        }
      } catch (pollError) {
        throw new Error(BACKGROUND_PROCESSING_MESSAGE)
      }

      const stage = String(statusData.status || '').toUpperCase()
      const progress = typeof statusData.progress === 'number' ? statusData.progress : 0
      const elapsedMs = Date.now() - startedWaitingAt
      const progressLabel = progress > 0 ? `${progress}%` : 'starting'
      const longProcessingSuffix =
        elapsedMs >= LONG_PROCESSING_NOTICE_MS
          ? ' You can leave this screen; we will notify you when it is ready.'
          : ''
      setUploadState({
        status: 'UPLOADING',
        message: `Generating flashcards... ${progressLabel}.${longProcessingSuffix}`,
      })

      if (!longProcessingNoticeShown && elapsedMs >= LONG_PROCESSING_NOTICE_MS) {
        longProcessingNoticeShown = true
        addBreadcrumb('PDF generation is taking longer than 30 seconds', {
          upload_id: uploadId,
          progress,
          stage,
        }, 'ai')
      }

      if (stage === 'COMPLETED') {
        finalStatus = statusData
        break
      }

      if (stage === 'FAILED') {
        const error = new Error(statusData.error?.message || 'Document processing failed. Please try again later.') as Error & { code?: string }
        error.code = statusData.error?.code
        throw error
      }

      if (stage === 'CANCELLED') {
        const error = new Error(statusData.error?.message || 'Flashcard generation was aborted.') as Error & { code?: string }
        error.code = statusData.error?.code || 'USER_ABORTED'
        throw error
      }
    }

    if (!finalStatus) {
      throw new Error(BACKGROUND_PROCESSING_MESSAGE)
    }

    return finalStatus
  }

  const resumeUploadProgress = async (
    uploadId: string,
    options: { quietBackgroundAlert?: boolean } = {}
  ) => {
    try {
      if (!isOnline) {
        throw new Error(BACKGROUND_CHECK_MESSAGE)
      }

      const token = await getToken()
      const apiUrl = process.env.EXPO_PUBLIC_API_URL

      if (!token || !apiUrl) {
        throw new Error(BACKGROUND_CHECK_MESSAGE)
      }

      setUploadState({
        status: 'UPLOADING',
        message: 'Checking flashcard generation progress...',
      })
      setActiveUploadId(uploadId)

      const finalStatus = await watchUploadProgress(uploadId, apiUrl)
      activeUploadRef.current = null
      void loadUsage()
      setUploadState({
        status: 'SUCCESS',
        message: '',
      })
      showToast('Your flashcards are ready.', 'success')
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      router.push(finalStatus.deck_id ? (`/deck/${finalStatus.deck_id}` as any) : '/decks')
    } catch (error) {
      activeUploadRef.current = null
      const message =
        error instanceof Error && error.message === 'Upload cancelled.'
          ? BACKGROUND_PROCESSING_MESSAGE
          : error instanceof Error
            ? error.message
            : String(error)
      const backgroundMessage =
        isBackgroundProcessingMessage(message) || isLikelyProgressCheckError(message)
          ? BACKGROUND_CHECK_MESSAGE
          : message
      const errorCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined
      const largePdf = isLargePdfError(errorCode, backgroundMessage)

      setUploadState({
        status:
          error instanceof Error && error.message === 'Upload cancelled.'
            ? 'CANCELLED'
            : isBackgroundProcessingMessage(backgroundMessage)
              ? 'BACKGROUND'
              : 'FAILED',
        message: backgroundMessage,
        ...(errorCode || largePdf ? { code: largePdf ? 'PREMIUM_REQUIRED' : errorCode } : {}),
      })
      if (largePdf) {
        router.push('/billing' as any)
      }
      if (isBackgroundProcessingMessage(backgroundMessage)) {
        if (!options.quietBackgroundAlert) {
          showToast('Generation is running in the background.', 'info', 'You can review existing decks or do other work now.')
        }
      } else if (!(error instanceof Error && error.message === 'Upload cancelled.')) {
        captureException(error, {
          feature: 'ai_deck_generation',
          action: 'resume_pdf_generation_progress',
          extra: { upload_id: uploadId },
        })
        showToast(backgroundMessage, 'error')
      }
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadUsage()
      if (activeUploadId) {
        await resumeUploadProgress(activeUploadId, { quietBackgroundAlert: true })
        return
      }

      const upload = await checkActiveUpload()
      if (upload?.upload_id) {
        setActiveUploadId(upload.upload_id)
        const stage = String(upload.status || '').toUpperCase()
        if (stage === 'FAILED') {
          setUploadState({
            status: 'FAILED',
            message: upload.error?.message || 'Document processing failed. Please try again later.',
            ...(upload.error?.code ? { code: upload.error.code } : {}),
          })
        } else if (stage === 'CANCELLED') {
          setUploadState({
            status: 'CANCELLED',
            message: upload.error?.message || 'Flashcard generation was aborted.',
          })
        } else {
          setUploadState({
            status: 'BACKGROUND',
            message: BACKGROUND_PROCESSING_MESSAGE,
          })
        }
      }
    } catch (error) {
      captureException(error, {
        feature: 'ai_deck_generation',
        action: 'refresh_upload_screen',
        extra: { upload_id: activeUploadId },
      })
    } finally {
      setRefreshing(false)
    }
  }, [activeUploadId, checkActiveUpload])

  const handleGenerate = async () => {
    if (!selectedFile) {
      showToast('Please select a PDF document first.', 'error')
      return
    }

    if (!isOnline) {
      setUploadState({
        status: 'FAILED',
        message: 'Upload failed. No internet connection.',
      })
      return
    }

    if (selectedFile.size && selectedFile.size > MAX_PDF_SIZE_BYTES) {
      showToast('Please choose a PDF smaller than 30 MB.', 'error')
      return
    }

    if (!usage.unlimited && (usage.remaining ?? 0) <= 0) {
      showInfo({
        title: 'AI limit reached',
        message: `You have used all 10 free AI generations for this 24-hour window. ${getLocalResetLabel()}.`,
        action: { label: 'Pro details', onPress: () => router.push('/billing' as any) }
      })
      return
    }

    try {
      activeUploadRef.current = null
      setUploadState({
        status: 'UPLOADING',
        message: 'Requesting secure upload authorization...',
      })

      const token = await getToken()
      const apiUrl = process.env.EXPO_PUBLIC_API_URL

      if (!token || !apiUrl) {
        throw new Error('Missing API credentials or authentication token.')
      }

      // Step 1: Get presigned URL
      const presignedRes = await fetchWithTimeout(
        `${apiUrl}/uploads/presigned-url?file_name=${encodeURIComponent(selectedFile.name)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        PRESIGNED_TIMEOUT_MS
      )
      
      const presignedData = await readJsonResponse(presignedRes)
      if (!presignedRes.ok) {
        throw new Error(getErrorDetail(presignedData, 'Failed to get upload destination.'))
      }

      // Step 2: Upload the actual PDF using XMLHttpRequest to support direct native file streaming!
      if (!isOnline) {
        throw new Error('Upload failed. No internet connection.')
      }

      setUploadState({
        status: 'UPLOADING',
        message: 'Uploading PDF document to secure storage...',
      })
      
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        activeUploadRef.current = {
          cancel: () => xhr.abort(),
        }
        xhr.open('PUT', presignedData.upload_url)
        xhr.timeout = PDF_UPLOAD_TIMEOUT_MS
        
        // Add headers
        xhr.setRequestHeader('Content-Type', 'application/pdf')
        if (presignedData.headers) {
          for (const [key, value] of Object.entries(presignedData.headers)) {
            xhr.setRequestHeader(key, value as string)
          }
        }
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Upload failed with status code ${xhr.status}`))
          }
        }
        
        xhr.onerror = () => {
          reject(new Error('Upload failed. No internet connection.'))
        }

        xhr.ontimeout = () => {
          reject(new Error('Upload timed out. Please try again.'))
        }

        xhr.onabort = () => {
          reject(new Error('Upload cancelled.'))
        }
        
        if (Platform.OS === 'web') {
          // Web platform: use standard blob upload
          fetch(selectedFile.uri)
            .then(res => res.blob())
            .then(blob => {
              xhr.send(blob)
            })
            .catch(reject)
        } else {
          // Native platforms: pass React Native file structure directly to stream natively!
          const fileData = {
            uri: selectedFile.uri,
            type: selectedFile.mimeType || 'application/pdf',
            name: selectedFile.name,
          }
          xhr.send(fileData as any)
        }
      })
      activeUploadRef.current = null

      // Step 3: Queue PDF processing and poll progress.
      if (!isOnline) {
        throw new Error('Upload failed. No internet connection.')
      }

      setUploadState({
        status: 'UPLOADING',
        message: 'Starting flashcard generation...',
      })
      const processRes = await fetchWithTimeout(`${apiUrl}/uploads/process-async`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_url: presignedData.file_url,
          file_name: selectedFile.name,
          file_type: selectedFile.mimeType || 'application/pdf',
          num_cards: cardLimit,
          timezone: getDeviceTimezone(),
        }),
      }, QUEUE_TIMEOUT_MS)

      const processData = await readJsonResponse(processRes)
      if (!processRes.ok) {
        const message = getErrorDetail(processData, 'Failed to process document and generate flashcards.')
        if (processRes.status === 429) {
          router.push('/billing' as any)
        }
        throw new Error(message)
      }

      const uploadId = processData.upload_id
      if (!uploadId) {
        throw new Error('Upload job was not created. Please try again.')
      }
      setActiveUploadId(uploadId)

      const finalStatus = await watchUploadProgress(uploadId, apiUrl)

      activeUploadRef.current = null
      void loadUsage()
      setUploadState({
        status: 'SUCCESS',
        message: '',
      })
      addBreadcrumb('Generate AI deck completed', {
        source: 'pdf',
        upload_id: uploadId,
      }, 'ai')
      await analyticsEvents.generateDeckAi('pdf', cardLimit)
      addBreadcrumb('Create deck completed', { source: 'pdf_ai', deck_id: finalStatus.deck_id }, 'deck')
      await analyticsEvents.createDeck(finalStatus.deck_id, 'pdf_ai')
      showToast('Your flashcards are ready.', 'success')
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      router.push(finalStatus.deck_id ? (`/deck/${finalStatus.deck_id}` as any) : '/decks')
    } catch (error) {
      activeUploadRef.current = null
      const message =
        error instanceof Error && error.message === 'Upload cancelled.'
          ? 'Upload cancelled.'
          : error instanceof Error
            ? error.message
            : String(error)
      const errorCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined
      const largePdf = isLargePdfError(errorCode, message)

      setUploadState({
        status:
          message === 'Upload cancelled.'
            ? 'CANCELLED'
            : message === BACKGROUND_PROCESSING_MESSAGE
              ? 'BACKGROUND'
              : 'FAILED',
        message,
        ...(errorCode || largePdf ? { code: largePdf ? 'PREMIUM_REQUIRED' : errorCode } : {}),
      })
      if (largePdf) {
        router.push('/billing' as any)
      }
      if (message === BACKGROUND_PROCESSING_MESSAGE) {
        showToast('Generation is running', 'info', 'We will update you when the cards are ready.')
      } else if (largePdf) {
        showInfo({
          title: 'Large PDF detected',
          message,
          action: { label: 'Pro details', onPress: () => router.push('/billing' as any) }
        })
      } else if (message !== 'Upload cancelled.') {
        captureException(error, {
          feature: 'ai_deck_generation',
          action: 'generate_from_pdf',
          extra: {
            file_type: selectedFile?.mimeType,
            file_size: selectedFile?.size,
            requested_card_count: cardLimit,
          },
        })
        showToast(message, 'error')
      }
    }
  }

  const cancelUpload = () => {
    activeUploadRef.current?.cancel()
    activeUploadRef.current = null
    if (activeUploadId) {
      setUploadState({
        status: 'BACKGROUND',
        message: BACKGROUND_PROCESSING_MESSAGE,
      })
      return
    }

    setUploadState({
      status: 'CANCELLED',
      message: 'Upload cancelled.',
    })
  }

  const abortUpload = async () => {
    if (!activeUploadId) {
      cancelUpload()
      return
    }

    try {
      activeUploadRef.current?.cancel()
      activeUploadRef.current = null
      const token = await getToken()
      const apiUrl = process.env.EXPO_PUBLIC_API_URL
      if (!token || !apiUrl) {
        throw new Error('Missing API credentials or authentication token.')
      }

      const response = await fetchWithTimeout(`${apiUrl}/uploads/${activeUploadId}/abort`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }, STATUS_POLL_TIMEOUT_MS)
      const data = await readJsonResponse(response)
      if (!response.ok) {
        throw new Error(getErrorDetail(data, 'Could not abort generation.'))
      }

      setActiveUploadId(null)
      setUploadState({
        status: 'CANCELLED',
        message: data?.message || 'Flashcard generation was aborted.',
      })
    } catch (error) {
      captureException(error, {
        feature: 'ai_deck_generation',
        action: 'abort_pdf_generation',
        extra: { upload_id: activeUploadId },
      })
      showToast(error instanceof Error ? error.message : 'Could not abort generation.', 'error')
    }
  }

  const getLoadingIllustration = () => {
    if (status.toLowerCase().includes('upload')) {
      return pikaAssets.uploading
    }
    return pikaAssets.siidWorking
  }

  const isRunningInBackground = uploadState.status === 'BACKGROUND'
  const canShowUploadForm = uploadState.status !== 'BACKGROUND'

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AuthenticatedShell
        title="Upload PDF"
        subtitle="Turn documents into flashcards"
        scrollEnabled={!isSliding}
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
          {uploading ? (
            <View style={styles.loadingContainer}>
              <Image
                source={getLoadingIllustration()}
                style={{ width: 160, height: 160, alignSelf: 'center', marginBottom: 12 }}
                resizeMode="contain"
              />
              <ActivityIndicator color={colors.primary} size="large" style={{ marginBottom: 16 }} />
              <Text style={styles.statusText}>{status}</Text>
              <TouchableOpacity onPress={cancelUpload} style={styles.cancelBtn} activeOpacity={0.8}>
                <Text style={styles.cancelText}>{activeUploadId ? 'Stop watching' : 'Cancel upload'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {uploadState.status === 'BACKGROUND' ? (
                <View style={styles.failureCard}>
                  <Image
                    source={pikaAssets.siidWorking}
                    style={{ width: 92, height: 92, marginBottom: 8 }}
                    resizeMode="contain"
                  />
                  <Text style={styles.failureTitle}>Generation is running</Text>
                  <Text style={styles.backgroundText}>
                    We will update you when the cards are generated. You can review existing decks or do other work now.
                  </Text>
                  <View style={styles.backgroundActions}>
                    <TouchableOpacity
                      onPress={() => router.push('/home' as any)}
                      style={styles.secondaryBtn}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.secondaryBtnText}>Go Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void abortUpload()}
                      style={styles.dangerBtn}
                      activeOpacity={0.85}
                    >
                      <Feather name="x-circle" size={14} color={colors.danger} />
                      <Text style={styles.dangerBtnText}>Abort</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => activeUploadId && void resumeUploadProgress(activeUploadId)}
                      disabled={!activeUploadId}
                      style={[styles.retryBtn, !activeUploadId && styles.disabled]}
                      activeOpacity={0.85}
                    >
                      <Feather name="refresh-cw" size={14} color={colors.primaryForeground} />
                      <Text style={styles.retryText}>Check Progress</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {!isRunningInBackground && (uploadState.status === 'FAILED' || uploadState.status === 'CANCELLED') ? (
                <View style={styles.compactFailureCard}>
                  <View style={styles.failureHeader}>
                    <View style={styles.failureIcon}>
                      <Feather
                        name={uploadState.status === 'CANCELLED' ? 'x-circle' : 'alert-circle'}
                        size={18}
                        color={colors.danger}
                      />
                    </View>
                    <View style={styles.failureCopy}>
                      <Text style={styles.compactFailureTitle}>
                        {getFailureTitle(uploadState)}
                      </Text>
                      <Text style={styles.compactFailureText}>{uploadState.message}</Text>
                    </View>
                  </View>
                  {uploadState.status === 'FAILED' && uploadState.code === 'PREMIUM_REQUIRED' ? (
                    <TouchableOpacity
                      onPress={() => router.push('/billing' as any)}
                      style={styles.compactRetryBtn}
                      activeOpacity={0.85}
                    >
                      <Feather name="zap" size={14} color={colors.primaryForeground} />
                      <Text style={styles.retryText}>View Pro Details</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={handleGenerate}
                      disabled={!selectedFile}
                      style={[styles.compactRetryBtn, !selectedFile && styles.disabled]}
                      activeOpacity={0.85}
                    >
                      <Feather name="refresh-cw" size={14} color={colors.primaryForeground} />
                      <Text style={styles.retryText}>Retry Upload</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}

              {canShowUploadForm ? (
                <>
              <TouchableOpacity style={styles.usageCard} activeOpacity={0.78} onPress={showUsageResetInfo}>
                <View style={styles.usageIcon}>
                  <Feather name="zap" size={18} color={colors.primary} />
                </View>
                <View style={styles.usageCopy}>
                  <Text style={styles.usageTitle}>AI generations</Text>
                  <Text style={styles.usageSub}>
                    {usage.unlimited ? 'Unlimited with Pro' : `${usage.remaining}/${usage.limit} left`}
                  </Text>
                  <Text style={styles.usageResetText}>{getLocalResetLabel()}</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => router.push('/billing' as any)}
                  style={styles.proPill}
                >
                  <Text style={styles.proPillText}>Pro</Text>
                </TouchableOpacity>
              </TouchableOpacity>

              {/* File picker dropzone */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={pickDocument}
                style={[
                  styles.dropzone,
                  selectedFile ? styles.dropzoneSelected : null,
                ]}
              >
                {selectedFile ? (
                  <View style={styles.fileDetails}>
                    <View style={styles.fileIconWrap}>
                      <Feather name="file-text" size={32} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {selectedFile.name}
                      </Text>
                      <Text style={styles.fileSize}>
                        {formatBytes(selectedFile.size)} / 30 MB max
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={pickDocument}
                      style={styles.changeBtn}
                    >
                      <Text style={styles.changeBtnText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.dropzonePlaceholder}>
                    <Image
                      source={pikaAssets.searching}
                      style={{ width: 100, height: 100, marginBottom: 4 }}
                      resizeMode="contain"
                    />
                    <Text style={styles.uploadTitle}>Choose a PDF file</Text>
                    <Text style={styles.uploadSub}>Tap here to select document</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Flashcards limit slider */}
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
                  onLayout={(e) => {
                    sliderWidthRef.current = e.nativeEvent.layout.width
                  }}
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
                  <View
                    style={[
                      styles.sliderFill,
                      { width: `${((cardLimit - 5) / 25) * 100}%` },
                    ]}
                    pointerEvents="none"
                  />
                  <View
                    style={[
                      styles.sliderKnob,
                      { left: `${((cardLimit - 5) / 25) * 100}%` },
                    ]}
                    pointerEvents="none"
                  />
                </View>

                <View style={styles.sliderLabels}>
                  <Text style={styles.sliderLimitLabel}>Min: 5</Text>
                  <Text
                    style={[
                      styles.sliderLimitLabel,
                      { color: colors.primary, fontWeight: '700' },
                    ]}
                  >
                    Default: 10
                  </Text>
                  <Text style={styles.sliderLimitLabel}>Max: 30</Text>
                </View>
              </View>

              {/* Generate button */}
              <TouchableOpacity
                disabled={!selectedFile || (!usage.unlimited && (usage.remaining ?? 0) <= 0) || !isOnline}
                onPress={handleGenerate}
                activeOpacity={selectedFile && (usage.unlimited || (usage.remaining ?? 0) > 0) && isOnline ? 0.85 : 1}
                style={[
                  styles.generateBtn,
                  (!selectedFile || (!usage.unlimited && (usage.remaining ?? 0) <= 0) || !isOnline) && styles.generateDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="creation"
                  size={18}
                  color={selectedFile && (usage.unlimited || (usage.remaining ?? 0) > 0) && isOnline ? colors.primaryForeground : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.generateText,
                    {
                      color: selectedFile && (usage.unlimited || (usage.remaining ?? 0) > 0) && isOnline ? colors.primaryForeground : colors.mutedForeground,
                    },
                  ]}
                >
                  {!isOnline ? 'Connect to Generate' : usage.unlimited || (usage.remaining ?? 0) > 0 ? 'Generate Flashcards' : 'AI Limit Reached'}
                </Text>
              </TouchableOpacity>
                </>
              ) : null}
            </>
          )}
        </View>
      </AuthenticatedShell>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, marginTop: 12, gap: 24 },
  usageCard: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.soft,
  },
  usageIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  usageCopy: {
    flex: 1,
  },
  usageTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.foreground,
  },
  usageSub: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.mutedForeground,
    marginTop: 2,
  },
  usageResetText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginTop: 2,
  },
  proPill: {
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  proPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  failureCard: {
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    padding: 24,
    alignItems: 'center',
    gap: 10,
    ...shadows.soft,
  },
  compactFailureCard: {
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.22)',
    padding: 14,
    gap: 12,
  },
  failureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  failureIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  failureCopy: {
    flex: 1,
  },
  failureTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.foreground,
  },
  compactFailureTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.foreground,
  },
  failureText: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    lineHeight: 18,
  },
  compactFailureText: {
    fontSize: 12,
    color: colors.danger,
    lineHeight: 17,
    marginTop: 2,
  },
  backgroundText: {
    fontSize: 13,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 18,
  },
  backgroundActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  secondaryBtn: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: colors.foreground,
    fontWeight: '800',
    fontSize: 13,
  },
  dangerBtn: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerBtnText: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 13,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius['2xl'],
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    ...shadows.pop,
  },
  compactRetryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  retryText: {
    color: colors.primaryForeground,
    fontWeight: '800',
    fontSize: 13,
  },
  cancelBtn: {
    marginTop: 16,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: colors.foreground,
    fontWeight: '800',
    fontSize: 12,
  },
  dropzone: {
    backgroundColor: colors.card,
    borderRadius: radius['3xl'],
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: 32,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  dropzoneSelected: {
    borderStyle: 'solid',
    borderColor: colors.primary,
    padding: 24,
    minHeight: 100,
  },
  dropzonePlaceholder: {
    alignItems: 'center',
    gap: 12,
  },
  uploadIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(91, 79, 230, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.foreground,
  },
  uploadSub: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  fileDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
  },
  fileIconWrap: {
    width: 50,
    height: 50,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(91, 79, 230, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.foreground,
  },
  fileSize: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  changeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  changeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.foreground,
  },
  disabled: {
    opacity: 0.7,
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
    marginTop: -7,
    marginLeft: -10,
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
  statusText: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    lineHeight: 18,
  },
  generateBtn: {
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


