import { describe, expect, it, vi } from 'vitest'
import type { CallParticipant, CallVideo } from './call'
import { PAGE_SIZE, nextSpeaker, orderRemotes, pageOf, syncVideos, toneOf, type TileContext } from './grid'

const video = (): CallVideo => ({ attach: vi.fn(), detach: vi.fn(), setEnabled: vi.fn() })
const person = (id: string, over: Partial<CallParticipant> = {}): CallParticipant => ({
  id, name: id, local: false, speaking: false, quality: 'good', mic: false, camera: false, video: null, ...over,
})
const ctx = (over: Partial<TileContext> = {}): TileContext => ({ animators: new Set(), floor: null, joined: [], ...over })
const ids = (list: CallParticipant[]) => list.map((p) => p.id)

/** Me plus `n` others, joined in the order p1, p2, … */
function call(n: number) {
  const others = Array.from({ length: n }, (_, i) => person(`p${i + 1}`))
  return { people: [person('me', { local: true }), ...others], joined: ['me', ...others.map((p) => p.id)] }
}

describe('tile order', () => {
  it('puts the speaker, then animators, the floor holder, cameras on, then join order', () => {
    const people = [
      person('late'), person('cam', { camera: true }), person('floor'), person('anim'), person('talk', { speaking: true }), person('early'),
    ]
    const order = orderRemotes(people, ctx({ animators: new Set(['anim']), floor: 'floor', joined: ['early', 'late', 'cam', 'floor', 'anim', 'talk'] }), 'talk')
    expect(ids(order)).toEqual(['talk', 'anim', 'floor', 'cam', 'early', 'late'])
  })

  it('never lists you among the others', () => {
    expect(ids(orderRemotes([person('me', { local: true }), person('a')], ctx(), null))).toEqual(['a'])
  })
})

describe('active speaker', () => {
  it('follows the person talking and stays through their pauses', () => {
    const quiet = [person('a'), person('b')]
    expect(nextSpeaker(null, quiet)).toBeNull()
    expect(nextSpeaker(null, [person('a'), person('b', { speaking: true })])).toBe('b')
    expect(nextSpeaker('b', quiet)).toBe('b')
    expect(nextSpeaker('b', [person('a', { speaking: true }), person('b', { speaking: true })])).toBe('b')
    expect(nextSpeaker('b', [person('a', { speaking: true }), person('b')])).toBe('a')
  })

  it('ignores your own voice and forgets someone who left', () => {
    expect(nextSpeaker(null, [person('me', { local: true, speaking: true }), person('a')])).toBeNull()
    expect(nextSpeaker('gone', [person('a')])).toBeNull()
  })
})

describe('pages', () => {
  it('shows at most 9 tiles on a computer and 4 on a phone, your preview last', () => {
    const { people, joined } = call(11)
    const wide = pageOf(people, ctx({ joined }), null, PAGE_SIZE.wide, 0)
    expect(wide.tiles).toHaveLength(9)
    expect(wide.pages).toBe(2)
    expect(wide.tiles.at(-1)?.id).toBe('me')
    const phone = pageOf(people, ctx({ joined }), null, PAGE_SIZE.compact, 0)
    expect(phone.tiles).toHaveLength(4)
    expect(ids(phone.tiles)).toEqual(['p1', 'p2', 'p3', 'me'])
    expect(phone.pages).toBe(4)
  })

  it('reaches everyone exactly once across the pages', () => {
    const { people, joined } = call(11)
    const seen: string[] = []
    const first = pageOf(people, ctx({ joined }), null, PAGE_SIZE.compact, 0)
    for (let i = 0; i < first.pages; i++) seen.push(...ids(pageOf(people, ctx({ joined }), null, PAGE_SIZE.compact, i).tiles).filter((id) => id !== 'me'))
    expect(seen.sort()).toEqual(joined.filter((id) => id !== 'me').sort())
  })

  it('keeps the speaker on screen on every page', () => {
    const { people, joined } = call(11)
    people[11] = person('p11', { speaking: true })
    const speaker = nextSpeaker(null, people)
    expect(speaker).toBe('p11')
    const first = pageOf(people, ctx({ joined }), speaker, PAGE_SIZE.compact, 0)
    expect(first.tiles[0]?.id).toBe('p11')
    expect(first.pinned).toBeNull()
    for (let i = 1; i < first.pages; i++) {
      const page = pageOf(people, ctx({ joined }), speaker, PAGE_SIZE.compact, i)
      expect(page.tiles[0]?.id).toBe('p11')
      expect(page.pinned).toBe('p11')
      expect(page.tiles.length).toBeLessThanOrEqual(PAGE_SIZE.compact)
    }
    // Everyone is still reachable once, the speaker apart.
    const others = Array.from({ length: first.pages }, (_, i) => ids(pageOf(people, ctx({ joined }), speaker, PAGE_SIZE.compact, i).tiles))
      .flat().filter((id) => id !== 'me' && id !== 'p11')
    expect(new Set(others).size).toBe(10)
    expect(others).toHaveLength(10)
  })

  it('clamps a page that no longer exists and shows you alone', () => {
    const { people, joined } = call(3)
    expect(pageOf(people, ctx({ joined }), null, PAGE_SIZE.wide, 5)).toMatchObject({ page: 0, pages: 1 })
    expect(ids(pageOf([person('me', { local: true })], ctx(), null, PAGE_SIZE.wide, 0).tiles)).toEqual(['me'])
  })
})

describe('videos received', () => {
  it('switches off the videos that are not on the page, and leaves your preview alone', () => {
    const mine = video()
    const shown = video()
    const off = video()
    const people = [person('me', { local: true, camera: true, video: mine }), person('a', { camera: true, video: shown }), person('b', { camera: true, video: off }), person('c')]
    syncVideos(people, new Set(['me', 'a']))
    expect(shown.setEnabled).toHaveBeenCalledWith(true)
    expect(off.setEnabled).toHaveBeenCalledWith(false)
    expect(mine.setEnabled).not.toHaveBeenCalled()
    syncVideos(people, null)
    expect(shown.setEnabled).toHaveBeenLastCalledWith(false)
  })
})

it('gives each person the same pastel every time', () => {
  expect(toneOf('3f1c')).toBe(toneOf('3f1c'))
  expect(toneOf('3f1c')).toBeGreaterThanOrEqual(0)
  expect(toneOf('3f1c')).toBeLessThan(6)
})
