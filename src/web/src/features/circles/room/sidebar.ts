import type { Member, Message } from '../../../api/circles'

/** Past this many rows the people list renders only the rows in view (spec 008 T804). */
export const WINDOW_FROM = 50
/** Rows drawn above and below the visible ones, so scrolling never shows a gap. */
const OVERSCAN = 6
export const SIDE_KEY = 'circloo.room.side'

export type PeopleRow =
  | { kind: 'head'; key: 'here' | 'away'; count: number }
  | { kind: 'person'; member: Member; here: boolean; index: number }

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/** Whether a name matches what was typed: case and accents never matter ("lucia" finds "Lucía"). */
export function matchesName(name: string, query: string): boolean {
  const q = fold(query.trim())
  return q === '' || fold(name).includes(q)
}

/**
 * Who is shown and in which order: people here first, then away; the animator leads each group, then by name.
 * You always count as here. Group headings carry the group size; empty groups have none.
 */
export function peopleRows(members: Member[], online: string[], meId: string | undefined, query: string, locale?: string): { rows: PeopleRow[]; here: number; away: number; found: number } {
  const isHere = (m: Member) => m.id === meId || online.includes(m.id)
  const byName = new Intl.Collator(locale, { sensitivity: 'base' })
  const order = (a: Member, b: Member) => Number(b.role === 'animator') - Number(a.role === 'animator') || byName.compare(a.name, b.name) || a.id.localeCompare(b.id)
  const here = members.filter(isHere).sort(order)
  const away = members.filter((m) => !isHere(m)).sort(order)
  const keep = (m: Member) => matchesName(m.name, query)
  const rows: PeopleRow[] = []
  let index = 0
  for (const [key, group] of [['here', here], ['away', away]] as const) {
    const shown = group.filter(keep)
    if (shown.length === 0) continue
    rows.push({ kind: 'head', key, count: shown.length })
    for (const member of shown) rows.push({ kind: 'person', member, here: key === 'here', index: index++ })
  }
  return { rows, here: here.length, away: away.length, found: index }
}

/** The slice of rows to draw for a scroll position, with the space to keep above and below. Everything below WINDOW_FROM. */
export function windowRows(total: number, rowHeight: number, scrollTop: number, viewHeight: number): { start: number; end: number; before: number; after: number } {
  if (total <= WINDOW_FROM || rowHeight <= 0) return { start: 0, end: total, before: 0, after: 0 }
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const last = Math.min(total, Math.ceil((scrollTop + Math.max(viewHeight, rowHeight)) / rowHeight) + OVERSCAN)
  const start = Math.min(first, Math.max(0, total - 1))
  const end = Math.max(start, last)
  return { start, end, before: start * rowHeight, after: (total - end) * rowHeight }
}

/** The wide-screen choice, kept per device. Open unless the person collapsed it; storage may be blocked. */
export function loadSideOpen(): boolean {
  try {
    return window.localStorage.getItem(SIDE_KEY) !== 'closed'
  } catch {
    return true
  }
}

export function saveSideOpen(open: boolean) {
  try {
    window.localStorage.setItem(SIDE_KEY, open ? 'open' : 'closed')
  } catch {
    // Blocked site data: the choice lasts until the page closes.
  }
}

/** Messages from others since the chat was last in view (system lines and your own never count). */
export function unreadCount(messages: Message[], seen: number, meId: string | undefined): number {
  return messages.slice(seen).filter((m) => m.kind !== 'system' && m.memberId !== meId).length
}

/** "99+" past 99: counts sit on small buttons and tabs; the exact number is in the accessible label. */
export const shortCount = (n: number) => (n > 99 ? '99+' : String(n))

/** How many characters the people strip stacks before "+n". */
export const STRIP_FACES = 4

/** Who the strip shows: people here first (you count as here), the animator leading, then the rest. */
export function stripFaces(members: Member[], online: string[], meId: string): Member[] {
  const here = (m: Member) => m.id === meId || online.includes(m.id)
  const rank = (m: Member) => (here(m) ? 0 : 2) + (m.role === 'animator' ? 0 : 1)
  return [...members].sort((a, b) => rank(a) - rank(b)).slice(0, STRIP_FACES)
}

/** "+12" past the stacked faces, never more than "+99" (a circle holds 100 people). */
export const stripMore = (count: number) => (count > STRIP_FACES ? `+${Math.min(99, count - STRIP_FACES)}` : '')

/** When the running round opened, from its "start:" system line (ISO time), or null until that line is known. */
export function roundStartedAt(messages: Message[], activity: string | null): string | null {
  if (!activity) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.kind === 'system' && m.text === `start:${activity}`) return m.at
  }
  return null
}

/** A round has no fixed end; the meter under its chip fills over the usual length of one, then stays full. */
export const ROUND_LENGTH_S = 15 * 60

/** Share of the usual round elapsed, 0–1. */
export const roundProgress = (elapsedS: number) => Math.min(1, Math.max(0, elapsedS / ROUND_LENGTH_S))

/** "4:07", "1:02:30" past an hour: ASCII digits, so the tabular numerals line up in every locale. */
export function formatElapsed(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`
}
