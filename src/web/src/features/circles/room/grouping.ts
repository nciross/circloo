import type { TFunction } from 'i18next'
import type { Member, Message } from '../../../api/circles'
import { viewLines, type LiveLine, type LiveView } from './liveLines'

/*
 * The chat's list logic (spec 008 US3, T806): how messages are grouped, how live updates land in the list, and what a
 * screen reader hears. Pure functions, so the rules are tested without a browser.
 */

/** A sender's messages stay in one group while each follows the previous one within this long. */
export const GROUP_GAP_MS = 3 * 60_000
/** The first announcement of a wave of messages waits this long, so messages sent together are said together. */
export const CHAT_GATHER = 1500
/** Screen readers hear about new messages at most this often (SC-809). */
export const CHAT_EVERY = 4000
/** A single new message is read out with its text, cut to this many characters. */
export const SAY_MAX = 120
/** In slow mode a participant sends one message per this many seconds (contracts/hub.md). */
export const SLOW_EVERY_S = 10

export type ChatItem =
  | { kind: 'group'; key: string; memberId: string | null; messages: Message[] }
  | { kind: 'system'; key: string; message: Message }
  | { kind: 'ai'; key: string; message: Message }
  /** A live line (call or hands), never stored (spec 009 US5 #3). */
  | { kind: 'live'; key: string; line: LiveView }
  /** A reply that went under an earlier message: this short line, where it happened, leads to it. */
  | { kind: 'replied'; key: string; message: Message }

/**
 * Replies sit under the message they answer (one level, spec 009 US5 #2): parent id to its replies, in id order. Only
 * replies whose parent is in the list are threaded; one whose parent is not loaded (older than the latest messages, or
 * shown again before it) stays in the flow as a message of its own.
 */
export function threadsOf(messages: Message[]): Map<number, Message[]> {
  const parents = new Set<number>()
  for (const m of messages) if (m.kind === 'member' && m.replyToId === null) parents.add(m.id)
  const threads = new Map<number, Message[]>()
  for (const m of messages) {
    if (m.replyToId === null || !parents.has(m.replyToId)) continue
    const list = threads.get(m.replyToId)
    if (list) list.push(m)
    else threads.set(m.replyToId, [m])
  }
  return threads
}

/** A reply shown in a thread, not in the flow. */
export const isThreaded = (m: Message, threads: Map<number, Message[]>) => m.replyToId !== null && threads.has(m.replyToId)

/**
 * The conversation as drawn, in id order.
 * - Consecutive messages from one person become one group (one name, one character). A system line, a circloo answer,
 *   a live line, another sender or a pause longer than `gapMs` starts a new one. The key is the group's first message,
 *   so a group keeps its key while it grows.
 * - A reply lives in its parent's thread, out of the flow, so it never splits its own sender's run nor anyone else's.
 *   When it lands away from its parent (other messages came between), a short "replied" line marks the moment in the
 *   flow, so people following the end still see it; that line does start a new group, like any line.
 * - Live lines sit after the message that was newest when they happened; hands moving together are one line.
 */
export function groupMessages(messages: Message[], gapMs = GROUP_GAP_MS, lines: LiveLine[] = []): ChatItem[] {
  const items: ChatItem[] = []
  const threads = threadsOf(messages)
  const pending = lines.slice().sort((a, b) => a.afterId - b.afterId || a.seq - b.seq)
  let li = 0
  const flushLines = (beforeId: number) => {
    const run: LiveLine[] = []
    while (li < pending.length && pending[li]!.afterId < beforeId) run.push(pending[li++]!)
    for (const { key, line } of viewLines(run)) items.push({ kind: 'live', key, line })
  }
  let prev: Message | null = null
  for (const m of messages) {
    flushLines(m.id)
    const before = prev
    prev = m
    if (isThreaded(m, threads)) {
      // Right after its parent or another reply to it, the thread is where people are reading: no pointer needed.
      const near = before !== null && (before.id === m.replyToId || before.replyToId === m.replyToId)
      if (!near) items.push({ kind: 'replied', key: `r${m.id}`, message: m })
      continue
    }
    if (m.kind === 'system') {
      items.push({ kind: 'system', key: `s${m.id}`, message: m })
      continue
    }
    if (m.kind === 'ai') {
      items.push({ kind: 'ai', key: `a${m.id}`, message: m })
      continue
    }
    const last = items[items.length - 1]
    if (last?.kind === 'group' && last.memberId === m.memberId) {
      const end = last.messages[last.messages.length - 1]!
      const gap = Date.parse(m.at) - Date.parse(end.at)
      if (!(gap > gapMs)) {
        last.messages.push(m)
        continue
      }
    }
    items.push({ kind: 'group', key: `g${m.id}`, memberId: m.memberId, messages: [m] })
  }
  flushLines(Number.POSITIVE_INFINITY)
  return items
}

/**
 * A message from the hub lands in the list: a new one goes in id order, a known one is replaced (likes, hidden, shown
 * again). The hub's broadcast cannot know whether you liked it, so your own like is kept.
 */
export function upsertMessage(messages: Message[], m: Message): Message[] {
  const i = messages.findIndex((x) => x.id === m.id)
  if (i >= 0) {
    const next = messages.slice()
    next[i] = { ...m, liked: messages[i]!.liked }
    return next
  }
  const clean = { ...m, likes: m.likes ?? 0, liked: m.liked ?? false, hidden: m.hidden ?? false, replyToId: m.replyToId ?? null }
  const last = messages[messages.length - 1]
  if (!last || last.id < m.id) return [...messages, clean]
  const at = messages.findIndex((x) => x.id > m.id)
  return [...messages.slice(0, at), clean, ...messages.slice(at)]
}

/** One message's fields changed; the same list comes back when the message is not there. */
export function patchMessage(messages: Message[], id: number, patch: Partial<Pick<Message, 'likes' | 'liked' | 'hidden'>>): Message[] {
  const i = messages.findIndex((x) => x.id === id)
  if (i < 0) return messages
  const next = messages.slice()
  next[i] = { ...messages[i]!, ...patch }
  return next
}

/** Messages a screen reader should hear about: from someone else (circloo included), never a system line, never yours. */
export function worthSaying(m: Message, meId: string | null | undefined): boolean {
  return m.kind !== 'system' && (m.kind === 'ai' || (m.memberId !== null && m.memberId !== meId))
}

/** How long to wait before the next announcement: a short gather, and never sooner than CHAT_EVERY after the last. */
export function announceDelay(lastSaid: number, now: number): number {
  return Math.max(CHAT_GATHER, lastSaid + CHAT_EVERY - now)
}

type Say =
  | { kind: 'none' }
  | { kind: 'one'; name: string; text: string }
  | { kind: 'many'; count: number }

/** What a batch comes down to: nothing, one message read out with its sender, or a count ("3 new messages"). */
export function batchSay(batch: Message[], members: Member[]): Say {
  if (batch.length === 0) return { kind: 'none' }
  if (batch.length > 1) return { kind: 'many', count: batch.length }
  const m = batch[0]!
  const name = m.kind === 'ai' ? 'circloo' : (members.find((x) => x.id === m.memberId)?.name ?? '')
  const flat = m.text.replace(/\s+/g, ' ').trim()
  const text = flat.length > SAY_MAX ? `${flat.slice(0, SAY_MAX - 1).trimEnd()}…` : flat
  return { kind: 'one', name, text }
}

/** The hub's "slow-mode:7": the seconds left, or null for any other code. */
export function slowModeSeconds(code: string): number | null {
  const match = /^slow-mode:(\d+)$/.exec(code)
  return match ? Math.max(1, Math.min(SLOW_EVERY_S, Number(match[1]))) : null
}

/** A chat refusal in words: the chat's own codes first, then the room's, then a plain "try again". */
export function chatError(t: TFunction, code: string): string {
  return t(`circles.chat.errors.${code}`, { defaultValue: t(`circles.errors.${code}`, { defaultValue: t('circles.errors.failed') }) })
}
