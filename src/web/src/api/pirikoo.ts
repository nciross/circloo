import { csrfHeaders, refreshCsrf } from './client'
import type { Locale } from '../i18n'

export type PirikooPage = 'home' | 'icebreakers' | 'circle' | 'create' | 'integrations' | 'settings' | 'other'

export interface PirikooTurn {
  role: 'user' | 'pirikoo'
  text: string
}

export interface PirikooAsk {
  message: string
  history: PirikooTurn[]
  lang: Locale
  page: PirikooPage
  circleId?: string | null
}

/** Why an answer did not come: shown as a kind line, never as a raw error. */
export type PirikooFailure = 'limited' | 'unsafe' | 'failed' | 'offline' | 'busy' | 'signedOut'

export class PirikooError extends Error {
  readonly code: PirikooFailure
  constructor(code: PirikooFailure) {
    super(code)
    this.code = code
  }
}

export interface PirikooEvent {
  t: 'delta' | 'done' | 'error'
  text?: string
  code?: string
  replaced?: boolean
}

/** Splits a server-sent-events buffer into complete events and the unfinished rest. */
export function parseEvents(buffer: string): { events: PirikooEvent[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n')
  const rest = parts.pop() ?? ''
  const events: PirikooEvent[] = []
  for (const part of parts) {
    const data = part
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (!data) continue
    try {
      const e = JSON.parse(data) as PirikooEvent
      if (e && (e.t === 'delta' || e.t === 'done' || e.t === 'error')) events.push(e)
    } catch {
      // A broken event is skipped; the final "done" carries the whole answer anyway.
    }
  }
  return { events, rest }
}

const FAILURES = new Set<PirikooFailure>(['limited', 'unsafe', 'failed'])

/**
 * Asks Pirikoo and streams the answer: `onDelta` gets each piece as it arrives. Resolves with the final text, which
 * may differ from the pieces when the server replaced an unsafe answer.
 */
export async function askPirikoo(
  body: PirikooAsk,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  retried = false,
): Promise<{ text: string; replaced: boolean }> {
  let res: Response
  try {
    res = await fetch('/api/pirikoo/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(await csrfHeaders()) },
      credentials: 'same-origin',
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new PirikooError('offline')
  }
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { type?: string }
    // A CSRF token bound to an identity that changed: refresh once, like every other call.
    if (res.status === 400 && problem.type === 'antiforgery' && !retried) {
      await refreshCsrf()
      return askPirikoo(body, onDelta, signal, true)
    }
    throw new PirikooError(res.status === 401 ? 'signedOut' : res.status === 429 ? 'busy' : 'failed')
  }
  if (!res.body) throw new PirikooError('failed')

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let streamed = ''
  for (;;) {
    let chunk: ReadableStreamReadResult<string>
    try {
      chunk = await reader.read()
    } catch (e) {
      if (signal?.aborted) throw e
      throw new PirikooError('offline')
    }
    if (chunk.done) break
    const { events, rest } = parseEvents(buffer + chunk.value)
    buffer = rest
    for (const e of events) {
      if (e.t === 'delta' && e.text) {
        streamed += e.text
        onDelta(e.text)
      } else if (e.t === 'done') {
        return { text: e.text ?? streamed.trim(), replaced: e.replaced === true }
      } else if (e.t === 'error') {
        const code = e.code as PirikooFailure
        throw new PirikooError(FAILURES.has(code) ? code : 'failed')
      }
    }
  }
  // The stream ended without a final word: the connection dropped.
  throw new PirikooError('offline')
}
