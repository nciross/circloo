import type { HandsView, Member } from '../../../api/circles'

/** No hand up and nobody speaking: what a room starts with until the hub says otherwise. */
export const NO_HANDS: HandsView = { queue: [], floor: null }

/** The first announcement of a wave of hands waits this long, so hands raised together are said together (US5 #6). */
export const HANDS_GATHER = 1000
/** Screen readers hear about hands at most this often. */
export const HANDS_EVERY = 3000
/** Past this many names in one announcement, the count is said instead. */
export const NAMES_MAX = 3

/** Only well-formed hands from the wire: ids and dates as strings, oldest first as the hub sent them. */
export function cleanHands(raw: unknown): HandsView {
  if (!raw || typeof raw !== 'object') return NO_HANDS
  const { queue, floor } = raw as { queue?: unknown; floor?: unknown }
  const seen = new Set<string>()
  const clean = (Array.isArray(queue) ? queue : []).flatMap((h: unknown) => {
    const { memberId, raisedAt } = (h ?? {}) as { memberId?: unknown; raisedAt?: unknown }
    if (typeof memberId !== 'string' || typeof raisedAt !== 'string' || seen.has(memberId)) return []
    seen.add(memberId)
    return [{ memberId, raisedAt }]
  })
  return { queue: clean, floor: typeof floor === 'string' ? floor : null }
}

/** Where you stand: speaking, waiting at a place (1 is next), or no hand up. */
export type MyHand = { kind: 'none' } | { kind: 'floor' } | { kind: 'queue'; place: number }

export function myHand(hands: HandsView, meId: string | null | undefined): MyHand {
  if (!meId) return { kind: 'none' }
  if (hands.floor === meId) return { kind: 'floor' }
  const i = hands.queue.findIndex((h) => h.memberId === meId)
  return i < 0 ? { kind: 'none' } : { kind: 'queue', place: i + 1 }
}

export const sameHand = (a: MyHand, b: MyHand) => a.kind === b.kind && (a.kind !== 'queue' || (b.kind === 'queue' && a.place === b.place))

/** Hands that went up between two views (someone given the floor or moving up the line is not new). */
export function newlyRaised(before: HandsView, after: HandsView): string[] {
  const known = new Set(before.queue.map((h) => h.memberId))
  if (before.floor) known.add(before.floor)
  return after.queue.map((h) => h.memberId).filter((id) => !known.has(id))
}

/** Whole minutes a hand has waited; a clock a little ahead of the server's never makes it negative. */
export function waitedMinutes(raisedAt: string, now: number): number {
  const at = Date.parse(raisedAt)
  return Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / 60_000)) : 0
}

/** Names joined the way the language says a list ("Amina, Kenji and Lucía"). */
export function listNames(names: string[], lng: string): string {
  try {
    return new Intl.ListFormat(lng, { style: 'long', type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}

/** The members of a queue, in its order; hands of people no longer in the list are skipped. */
export function queueMembers(hands: HandsView, members: Member[]): { member: Member; raisedAt: string }[] {
  const byId = new Map(members.map((m) => [m.id, m]))
  return hands.queue.flatMap((h) => {
    const member = byId.get(h.memberId)
    return member ? [{ member, raisedAt: h.raisedAt }] : []
  })
}
