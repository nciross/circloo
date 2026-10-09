import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '../../../i18n'
import type { HandsView, Member } from '../../../api/circles'
import { HANDS_BURST_MS, MAX_LINES, addLines, handsChanges, isLineNotice, liveLineText, viewLines, type LiveEvent, type LiveLine } from './liveLines'

const hands = (queue: string[], floor: string | null = null): HandsView => ({ queue: queue.map((memberId) => ({ memberId, raisedAt: '2026-10-09T10:00:00Z' })), floor })
const member = (id: string, name: string): Member => ({ id, name, role: 'participant', character: 'fox', ring: 0 })
const members = [member('a', 'Amina'), member('k', 'Kenji'), member('l', 'Lucía'), { ...member('t', 'Théo'), role: 'animator' as const }]
// The names come back isolated (U+2068 … U+2069) so they keep their direction; the tests read the plain words.
const plain = (s: string) => s.replace(/[⁨⁩]/g, '')

let seq = 0
const line = (event: LiveEvent, at = 0, afterId = 0): LiveLine => ({ seq: ++seq, afterId, activityId: 'brainstorm', at, event })
const up = (memberId: string, at = 0) => line({ kind: 'hand-up', memberId }, at)
const down = (memberId: string, at = 0) => line({ kind: 'hand-down', memberId }, at)

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

describe('handsChanges', () => {
  it('says hands raised and lowered', () => {
    expect(handsChanges(hands(['a']), hands(['a', 'k', 'l']))).toEqual([
      { kind: 'hand-up', memberId: 'k' },
      { kind: 'hand-up', memberId: 'l' },
    ])
    expect(handsChanges(hands(['a', 'k']), hands([]))).toEqual([
      { kind: 'hand-down', memberId: 'a' },
      { kind: 'hand-down', memberId: 'k' },
    ])
  })

  it('makes the floor one line: a hand that becomes the floor is not also “lowered”', () => {
    expect(handsChanges(hands(['a', 'k']), hands(['k'], 'a'))).toEqual([{ kind: 'floor', memberId: 'a' }])
  })

  it('says the floor moving to the next person, and a turn that ends', () => {
    expect(handsChanges(hands(['k'], 'a'), hands([], 'k'))).toEqual([{ kind: 'floor', memberId: 'k' }])
    expect(handsChanges(hands([], 'k'), hands([]))).toEqual([{ kind: 'floor-end', memberId: 'k' }])
  })

  it('finds nothing when nothing changed, or when the queue only reorders', () => {
    expect(handsChanges(hands(['a', 'k'], 'l'), hands(['k', 'a'], 'l'))).toEqual([])
  })
})

describe('addLines', () => {
  it('places lines after the newest message, in the round that is on, and keeps the last ones only', () => {
    let n = 0
    const where = { afterId: 42, activityId: 'canvas', at: 5, seq: () => ++n }
    const lines = addLines([], [{ kind: 'hand-up', memberId: 'a' }], where)
    expect(lines).toEqual([{ seq: 1, afterId: 42, activityId: 'canvas', at: 5, event: { kind: 'hand-up', memberId: 'a' } }])
    expect(addLines(lines, [], where)).toBe(lines)
    let many: LiveLine[] = []
    for (let i = 0; i < MAX_LINES + 5; i++) many = addLines(many, [{ kind: 'hand-up', memberId: `m${i}` }], where)
    expect(many).toHaveLength(MAX_LINES)
    expect(many[0]!.event).toEqual({ kind: 'hand-up', memberId: 'm5' })
  })
})

describe('isLineNotice', () => {
  it('keeps the circle-wide notices and leaves the personal ones to the notice bar', () => {
    expect(isLineNotice('call-started')).toBe(true)
    expect(isLineNotice('mode-hand')).toBe(true)
    expect(isLineNotice('floor-given')).toBe(false)
    expect(isLineNotice('mic-muted')).toBe(false)
  })
})

describe('viewLines', () => {
  it('groups a burst of hands going the same way into one line, once per person', () => {
    const run = [up('a', 0), up('k', 1000), up('a', 2000), up('l', 3000)]
    expect(viewLines(run)).toEqual([{ key: `l${run[0]!.seq}`, line: { kind: 'hands', dir: 'up', memberIds: ['a', 'k', 'l'] } }])
  })

  it('starts a new line when the direction changes, another event comes between, or the burst is over', () => {
    const run = [
      up('a', 0),
      down('k', 10),
      down('l', 20),
      line({ kind: 'floor', memberId: 'a' }, 30),
      up('k', 40),
      up('l', 40 + HANDS_BURST_MS + 1),
    ]
    expect(viewLines(run).map((v) => v.line)).toEqual([
      { kind: 'hands', dir: 'up', memberIds: ['a'] },
      { kind: 'hands', dir: 'down', memberIds: ['k', 'l'] },
      { kind: 'floor', memberId: 'a' },
      { kind: 'hands', dir: 'up', memberIds: ['k'] },
      { kind: 'hands', dir: 'up', memberIds: ['l'] },
    ])
  })
})

describe('liveLineText', () => {
  const t = i18n.t.bind(i18n)
  const say = (l: Parameters<typeof liveLineText>[1], meId = 'k', lng = 'en') => plain(liveLineText(t, l, members, meId, lng))

  it('names who did it, says “you” for yourself, and goes without a name when nobody is known', () => {
    expect(say({ kind: 'notice', notice: 'call-started', by: 't' })).toBe('Théo started a call')
    expect(say({ kind: 'notice', notice: 'call-started', by: 't' }, 't')).toBe('You started a call')
    expect(say({ kind: 'notice', notice: 'call-ended', by: null })).toBe('The call ended')
    expect(say({ kind: 'notice', notice: 'video-off', by: 'gone' })).toBe('Video is off')
    expect(say({ kind: 'notice', notice: 'mode-hand', by: 't' })).toBe('Hand to speak: raise your hand to talk')
    expect(say({ kind: 'floor', memberId: 'a' })).toBe('Amina has the floor')
    expect(say({ kind: 'floor-end', memberId: 'k' })).toBe('Your turn is over')
  })

  it('names one or two hands and counts more (“3 hands raised”); your own among others is counted', () => {
    expect(say({ kind: 'hands', dir: 'up', memberIds: ['a'] })).toBe('Amina raised a hand')
    expect(say({ kind: 'hands', dir: 'up', memberIds: ['k'] })).toBe('You raised your hand')
    expect(say({ kind: 'hands', dir: 'up', memberIds: ['a', 'l'] })).toBe('Amina and Lucía raised their hands')
    expect(say({ kind: 'hands', dir: 'up', memberIds: ['a', 'k'] })).toBe('2 hands raised')
    expect(say({ kind: 'hands', dir: 'up', memberIds: ['a', 'k', 'l'] })).toBe('3 hands raised')
    expect(say({ kind: 'hands', dir: 'down', memberIds: ['a', 'l', 't'] })).toBe('3 hands lowered')
  })

  it('speaks Arabic with its plural forms', async () => {
    await i18n.changeLanguage('ar')
    try {
      expect(say({ kind: 'hands', dir: 'up', memberIds: ['a', 'l', 't'] }, 'k', 'ar')).toBe('رُفعت 3 أيادٍ')
      expect(say({ kind: 'notice', notice: 'call-started', by: 't' }, 'k', 'ar')).toBe('مكالمة جديدة بدعوة من Théo')
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
