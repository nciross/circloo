/**
 * The call grid's arithmetic (spec 009 T925, research R25, SC-912): who comes first, which tiles a page shows, and which
 * videos this screen receives. Pure functions, so the rules are tested without a browser or a call server.
 *
 * - Order: the active speaker, the animators, the floor holder, cameras on, then join order.
 * - A page holds at most 9 tiles on a computer and 4 on a phone; your own preview is one of them and stays on every page.
 * - The active speaker is always on screen: first on the first page, and in a reserved first slot on every other page.
 * - Videos of people who are not on the page shown are switched off, so the call server stops sending them.
 */
import type { CallParticipant } from './call'

/** Tiles on one page, your own preview included (SC-912). */
export const PAGE_SIZE = { wide: 9, compact: 4 } as const

export interface TileContext {
  /** Member ids of the circle's animators. */
  animators: ReadonlySet<string>
  /** The member who has the floor, if any. */
  floor: string | null
  /** Member ids in the order they joined the call (the roster). */
  joined: readonly string[]
}

export interface GridPage {
  tiles: CallParticipant[]
  /** The page shown, from 0, clamped to the pages that exist. */
  page: number
  pages: number
  /** The speaker kept on this page although their place is on another one. */
  pinned: string | null
}

/**
 * The speaker shown first. It stays while they talk and through the pauses between their sentences, and changes only
 * when someone else talks, so tiles do not jump at every breath. Your own voice never moves you.
 */
export function nextSpeaker(prev: string | null, people: readonly CallParticipant[]): string | null {
  const remote = people.filter((p) => !p.local)
  if (prev && remote.some((p) => p.id === prev && p.speaking)) return prev
  const talking = remote.find((p) => p.speaking)
  if (talking) return talking.id
  return prev && remote.some((p) => p.id === prev) ? prev : null
}

/** The other people in the call, in tile order. */
export function orderRemotes(people: readonly CallParticipant[], ctx: TileContext, speaker: string | null): CallParticipant[] {
  const joinedAt = new Map(ctx.joined.map((id, i) => [id, i]))
  const rank = (p: CallParticipant) => [
    p.id === speaker ? 0 : 1,
    ctx.animators.has(p.id) ? 0 : 1,
    p.id === ctx.floor ? 0 : 1,
    p.camera ? 0 : 1,
    joinedAt.get(p.id) ?? Number.MAX_SAFE_INTEGER,
  ]
  return people
    .filter((p) => !p.local)
    .map((p) => ({ p, r: rank(p) }))
    .sort((a, b) => {
      for (let i = 0; i < a.r.length; i++) if (a.r[i] !== b.r[i]) return a.r[i]! - b.r[i]!
      return a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0
    })
    .map((x) => x.p)
}

/** One page of tiles. `size` counts your own preview, which closes every page. */
export function pageOf(people: readonly CallParticipant[], ctx: TileContext, speaker: string | null, size: number, page: number): GridPage {
  const self = people.find((p) => p.local)
  const remotes = orderRemotes(people, ctx, speaker)
  const room = Math.max(1, size - (self ? 1 : 0))
  const first = remotes.slice(0, room)
  const rest = remotes.slice(room)
  // The speaker leads the order, so they are on the first page; later pages keep a slot for them.
  const pinned = speaker && remotes[0]?.id === speaker ? remotes[0] : undefined
  const per = Math.max(1, pinned ? room - 1 : room)
  const pages = 1 + Math.ceil(rest.length / per)
  const at = Math.min(Math.max(0, page), pages - 1)
  const shown = at === 0 ? first : [...(pinned ? [pinned] : []), ...rest.slice((at - 1) * per, at * per)]
  return { tiles: self ? [...shown, self] : shown, page: at, pages, pinned: at > 0 && pinned ? pinned.id : null }
}

/**
 * Receives only the videos shown (`shown` holds member ids; null when the grid is not on screen at all). Your own
 * preview is not received, so it is left alone.
 */
export function syncVideos(people: readonly CallParticipant[], shown: ReadonlySet<string> | null) {
  for (const p of people) {
    if (!p.local && p.video) p.video.setEnabled(!!shown?.has(p.id))
  }
}

/** A pastel for a person's tile while their camera is off, the same on every screen. */
export function toneOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 6
}
