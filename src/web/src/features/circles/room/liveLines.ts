import type { TFunction } from 'i18next'
import type { CallNoticeKind } from '../../../api/discussion'
import type { HandsView, Member } from '../../../api/circles'
import { listNames } from './hands'

/*
 * Live lines (spec 009 US5 #3, T909): small lines in the conversation for what just happened in the room, the call
 * started, video on, the floor given, hands raised. They are built in this tab from the hub's `CallNotice` and `Hands`
 * events, never sent as messages and never stored: they have no id, do not count as new messages, are not read out by
 * the chat announcer, and a reload starts without them.
 */

/** The notices said to the whole circle that also become a line; the personal ones stay in the call's notice bar. */
export const LINE_NOTICES = ['call-started', 'call-ended', 'video-on', 'video-off', 'mode-open', 'mode-hand', 'muted-everyone'] as const
export type LineNotice = (typeof LINE_NOTICES)[number]
const LINE_NOTICE_SET = new Set<string>(LINE_NOTICES)
export const isLineNotice = (kind: CallNoticeKind | string): kind is LineNotice => LINE_NOTICE_SET.has(kind)

/** What one event says, before bursts are grouped. */
export type LiveEvent =
  | { kind: 'notice'; notice: LineNotice; by: string | null }
  | { kind: 'hand-up'; memberId: string }
  | { kind: 'hand-down'; memberId: string }
  | { kind: 'floor'; memberId: string }
  | { kind: 'floor-end'; memberId: string }

export interface LiveLine {
  /** Arrival order in this tab; also the line's key. */
  seq: number
  /** The newest message id this tab had when it happened: the line sits right after that message. */
  afterId: number
  /** The round that was on: the line belongs to that conversation. */
  activityId: string | null
  /** When it arrived (ms, this tab's clock), to group a burst of hands. */
  at: number
  event: LiveEvent
}

/** A line as drawn: hands moving together become one ("3 hands raised"). */
export type LiveView =
  | { kind: 'notice'; notice: LineNotice; by: string | null }
  | { kind: 'hands'; dir: 'up' | 'down'; memberIds: string[] }
  | { kind: 'floor'; memberId: string }
  | { kind: 'floor-end'; memberId: string }

/** Lines kept in a tab; older ones go, they are only a live trace. */
export const MAX_LINES = 60
/** Hands that move this close together, with nothing said between, are one line. */
export const HANDS_BURST_MS = 60_000

/**
 * What changed between two views of the hands: the floor given or ended, hands lowered, hands raised. A hand that
 * becomes the floor is the floor line only; the floor moving from one person to the next is the new holder's line.
 */
export function handsChanges(before: HandsView, after: HandsView): LiveEvent[] {
  const events: LiveEvent[] = []
  const was = new Set(before.queue.map((h) => h.memberId))
  const is = new Set(after.queue.map((h) => h.memberId))
  if (before.floor && !after.floor) events.push({ kind: 'floor-end', memberId: before.floor })
  if (after.floor && after.floor !== before.floor) events.push({ kind: 'floor', memberId: after.floor })
  for (const id of was) if (!is.has(id) && id !== after.floor) events.push({ kind: 'hand-down', memberId: id })
  for (const id of is) if (!was.has(id) && id !== before.floor) events.push({ kind: 'hand-up', memberId: id })
  return events
}

/** Adds events as lines after the newest message, keeping the last MAX_LINES. */
export function addLines(lines: LiveLine[], events: LiveEvent[], where: { afterId: number; activityId: string | null; at: number; seq: () => number }): LiveLine[] {
  if (events.length === 0) return lines
  const added = events.map((event) => ({ seq: where.seq(), afterId: where.afterId, activityId: where.activityId, at: where.at, event }))
  return [...lines, ...added].slice(-MAX_LINES)
}

/** Groups a run of lines that sit together: hands going the same way within a burst become one line. */
export function viewLines(run: LiveLine[]): { key: string; line: LiveView }[] {
  const out: { key: string; line: LiveView; dir?: 'up' | 'down'; from: number }[] = []
  for (const l of run) {
    const e = l.event
    if (e.kind === 'hand-up' || e.kind === 'hand-down') {
      const dir = e.kind === 'hand-up' ? 'up' : 'down'
      const last = out[out.length - 1]
      if (last?.line.kind === 'hands' && last.line.dir === dir && l.at - last.from <= HANDS_BURST_MS) {
        if (!last.line.memberIds.includes(e.memberId)) last.line.memberIds.push(e.memberId)
        continue
      }
      out.push({ key: `l${l.seq}`, line: { kind: 'hands', dir, memberIds: [e.memberId] }, from: l.at })
      continue
    }
    out.push({ key: `l${l.seq}`, line: e, from: l.at })
  }
  return out.map(({ key, line }) => ({ key, line }))
}

/** Names keep their own direction inside a sentence in any language. */
export const isolate = (name: string) => `⁨${name}⁩`

/** Past this many names, a hands line gives the count ("3 hands raised"). */
export const LINE_NAMES_MAX = 2

/**
 * The words of a line. The person who did it is named ("Théo started a call"), "You" when it was you, and the line
 * says what happened without a name when the person is not known (the call ended because the animator was away).
 */
export function liveLineText(t: TFunction, line: LiveView, members: Member[], meId: string | null | undefined, lng: string): string {
  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.name : undefined)
  const said = (key: string, id: string | null) => {
    if (id && id === meId) return t(key, { context: 'you' })
    const name = nameOf(id)
    return name ? t(key, { name: isolate(name) }) : t(key, { context: 'none' })
  }
  switch (line.kind) {
    case 'notice':
      return line.notice === 'mode-open' || line.notice === 'mode-hand' ? t(`circles.call.lines.${line.notice}`) : said(`circles.call.lines.${line.notice}`, line.by)
    case 'floor':
      return said('circles.call.lines.floor', line.memberId)
    case 'floor-end':
      return said('circles.call.lines.floorEnd', line.memberId)
    case 'hands': {
      const up = line.dir === 'up'
      const ids = line.memberIds
      if (ids.length === 1) return said(up ? 'circles.call.lines.handUp' : 'circles.call.lines.handDown', ids[0]!)
      // Your own hand among others is counted: "You and Amina raised their hands" reads wrong in every language.
      const names = ids.map((id) => (id === meId ? undefined : nameOf(id)))
      if (ids.length <= LINE_NAMES_MAX && names.every(Boolean)) {
        return t(up ? 'circles.call.lines.handsUp' : 'circles.call.lines.handsDown', { names: listNames(names.map((n) => isolate(n!)), lng) })
      }
      return t(up ? 'circles.call.lines.handsUpCount' : 'circles.call.lines.handsDownCount', { count: ids.length })
    }
  }
}
