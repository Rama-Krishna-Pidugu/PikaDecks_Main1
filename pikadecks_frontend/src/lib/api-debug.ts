export type ApiDebugState = {
  apiUrl?: string
  deckCount?: number
  error?: string
  message: string
  syncStatus?: number
  decksStatus?: number
}

export async function readJsonResponse(response: Response) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function formatDebugMessage(debug: ApiDebugState) {
  const lines = [
    debug.message,
    `API configured: ${debug.apiUrl ? 'yes' : 'missing EXPO_PUBLIC_API_URL'}`,
  ]

  if (debug.syncStatus) {
    lines.push(`sync-user: HTTP ${debug.syncStatus}`)
  }

  if (debug.decksStatus) {
    lines.push(`decks: HTTP ${debug.decksStatus}`)
  }

  if (typeof debug.deckCount === 'number') {
    lines.push(`decks received: ${debug.deckCount}`)
  }

  if (debug.error) {
    lines.push(`error: ${debug.error}`)
  }

  return lines.join('\n')
}
