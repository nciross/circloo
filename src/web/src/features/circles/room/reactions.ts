import { create } from 'zustand'
import type { HubConnection } from '@microsoft/signalr'

/** The six reactions, in the order every screen shows them (contracts/hub.md `React`). */
export const REACTION_KINDS = ['clap', 'heart', 'laugh', 'wow', 'like', 'party'] as const
export type ReactionKind = (typeof REACTION_KINDS)[number]

/** One grouped `Reactions` event from the hub: counts per kind, never who sent them. */
export type ReactionBurst = Partial<Record<ReactionKind, number>>
export type ReactionCounts = Partial<Record<ReactionKind, number>>

/** Emoji are the content here (anti-ai-look: reactions are user content), not decoration. */
export const REACTION_EMOJI: Record<ReactionKind, string> = { clap: '👏', heart: '❤️', laugh: '😂', wow: '😮', like: '👍', party: '🎉' }

/** At most this many emoji move over a slide at once; the rest only feed the grouped "×n" (spec US4 #2). */
export const MAX_MOVING = 12
/** A kind's "×n" stays this long after its last burst, then the next one starts a new count. */
export const WAVE_MS = 3000
/** Screen readers hear a summary at most this often (US4 #6). */
export const SAY_EVERY = 4000
/** The first summary of a wave waits this long, so it gathers the wave instead of its first tap. */
export const SAY_GATHER = 1000
/** The hub's per-member limit (FR-817), mirrored to show a gentle hint: anything over it is dropped without a word. */
export const SEND_LIMIT = 5
export const SEND_WINDOW = 10_000

/**
 * This page's own taps over the last ten seconds, mirroring the hub's limit so the bar can say when it rests. It cannot
 * be exact (another tab counts too), and it does not need to be: the hub decides, the bar only stays kind.
 */
export function sendWindow(clock: () => number = Date.now) {
  let sent: number[] = []
  const prune = () => {
    const now = clock()
    sent = sent.filter((at) => now - at < SEND_WINDOW)
    return now
  }
  return {
    /** Takes a slot for a tap; false when the window is full and the tap should not be sent. */
    take(): boolean {
      const now = prune()
      if (sent.length >= SEND_LIMIT) return false
      sent.push(now)
      return true
    },
    /** Milliseconds until the next slot frees, or 0 when one is free now. */
    restFor(): number {
      const now = prune()
      return sent.length >= SEND_LIMIT ? sent[0]! + SEND_WINDOW - now : 0
    },
  }
}

/** A burst as this page received it; ids only grow, so a layer knows which ones it has already played. */
export interface BurstEntry {
  id: number
  at: number
  burst: ReactionBurst
}

/** The running "×n" of one kind and when it last grew. */
export interface Wave {
  count: number
  at: number
}
export type Waves = Partial<Record<ReactionKind, Wave>>

export const isReactionKind = (k: unknown): k is ReactionKind => typeof k === 'string' && (REACTION_KINDS as readonly string[]).includes(k)

/** Known kinds with a positive whole count only; whatever else the wire carries is ignored. */
export function cleanBurst(raw: unknown): ReactionBurst {
  const burst: ReactionBurst = {}
  if (!raw || typeof raw !== 'object') return burst
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isReactionKind(k) && typeof v === 'number' && Number.isFinite(v) && v >= 1) burst[k] = Math.min(Math.floor(v), 10_000)
  }
  return burst
}

const kindsOf = (counts: ReactionCounts) => REACTION_KINDS.filter((k) => (counts[k] ?? 0) > 0)

/** Waves still showing at `now`. */
export function liveWaves(waves: Waves, now: number): Waves {
  const live: Waves = {}
  for (const k of REACTION_KINDS) {
    const w = waves[k]
    if (w && now - w.at < WAVE_MS) live[k] = w
  }
  return live
}

/** Adds a burst to the waves: a kind still showing keeps counting, a quiet one starts again from this burst. */
export function foldWaves(waves: Waves, burst: ReactionBurst, now: number): Waves {
  const next = liveWaves(waves, now)
  for (const k of kindsOf(burst)) next[k] = { count: (next[k]?.count ?? 0) + burst[k]!, at: now }
  return next
}

export function addCounts(a: ReactionCounts, b: ReactionCounts): ReactionCounts {
  const sum: ReactionCounts = { ...a }
  for (const k of kindsOf(b)) sum[k] = (sum[k] ?? 0) + b[k]!
  return sum
}

/** What arrived since `before` (never negative: after a reset everything counts as new). */
export function diffCounts(now: ReactionCounts, before: ReactionCounts): ReactionCounts {
  const diff: ReactionCounts = {}
  for (const k of REACTION_KINDS) {
    const d = (now[k] ?? 0) - (before[k] ?? 0)
    if (d > 0) diff[k] = d
    else if (d < 0 && (now[k] ?? 0) > 0) diff[k] = now[k]
  }
  return diff
}

/**
 * Which emoji get to move for a burst when `free` slots are left: one of each kind in turn, the biggest kinds first,
 * so a wave of claps never hides the only heart. Whatever does not fit only shows in the "×n".
 */
export function spawn(burst: ReactionBurst, free: number): ReactionKind[] {
  const left = Object.fromEntries(kindsOf(burst).map((k) => [k, burst[k]!])) as Record<ReactionKind, number>
  const order = kindsOf(burst).sort((x, y) => left[y] - left[x])
  const out: ReactionKind[] = []
  while (out.length < free) {
    let added = false
    for (const k of order) {
      if (out.length >= free) break
      if (left[k] > 0) {
        out.push(k)
        left[k]--
        added = true
      }
    }
    if (!added) break
  }
  return out
}

/** A stable number in [0, 1) from two integers, so the same burst always draws the same lanes (and tests stay exact). */
export function jitter(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x6b43a9b5, 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/**
 * The polite summary of what arrived ("12 applause, 3 hearts"), biggest first, in the reader's language. `say` turns
 * one kind and its count into words (a plural from the locale files).
 */
export function summarize(counts: ReactionCounts, say: (kind: ReactionKind, count: number) => string, lng: string): string {
  const parts = kindsOf(counts)
    .sort((x, y) => counts[y]! - counts[x]!)
    .map((k) => say(k, counts[k]!))
  if (parts.length === 0) return ''
  try {
    return new Intl.ListFormat(lng, { style: 'long', type: 'unit' }).format(parts)
  } catch {
    return parts.join(', ')
  }
}

interface ReactionsState {
  /** The latest bursts, newest last (a few only: layers play each one once, on arrival). */
  bursts: BurstEntry[]
  /** The "×n" per kind still showing. */
  waves: Waves
  /** Everything received since the presentation started on this page, for the screen-reader summary. */
  totals: ReactionCounts
  receive: (raw: unknown, now?: number) => void
  reset: () => void
}

let nextId = 1
let expiry: number | undefined

/** Wakes up when the next wave is due to end, so its "×n" leaves on time. */
function scheduleExpiry() {
  window.clearTimeout(expiry)
  const { waves } = useReactions.getState()
  const ats = REACTION_KINDS.flatMap((k) => (waves[k] ? [waves[k].at] : []))
  if (ats.length === 0) return
  const due = Math.min(...ats) + WAVE_MS - Date.now()
  expiry = window.setTimeout(() => {
    useReactions.setState((s) => ({ waves: liveWaves(s.waves, Date.now()) }))
    scheduleExpiry()
  }, Math.max(0, due) + 20)
}

/**
 * Reactions in the circle you are in or project (spec 008 US4), fed by `Reactions` hub events. Nothing here knows who
 * reacted, and nothing outlives the presentation: it is reset when the presentation ends or the connection closes.
 */
export const useReactions = create<ReactionsState>()((set) => ({
  bursts: [],
  waves: {},
  totals: {},
  receive: (raw, now = Date.now()) => {
    const burst = cleanBurst(raw)
    if (kindsOf(burst).length === 0) return
    const entry = { id: nextId++, at: now, burst }
    set((s) => ({ bursts: [...s.bursts, entry].slice(-8), waves: foldWaves(s.waves, burst, now), totals: addCounts(s.totals, burst) }))
    scheduleExpiry()
  },
  reset: () => {
    window.clearTimeout(expiry)
    set({ bursts: [], waves: {}, totals: {} })
  },
}))

/** Wires a hub connection (the room's or the audience screen's) to the reactions; `isCurrent` drops a stale connection's events. */
export function bindReactions(connection: HubConnection, isCurrent: () => boolean = () => true) {
  connection.on('Reactions', (burst: unknown) => {
    if (isCurrent()) useReactions.getState().receive(burst)
  })
  connection.on('PresentationEnded', () => {
    if (isCurrent()) useReactions.getState().reset()
  })
}
