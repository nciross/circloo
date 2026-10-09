import { describe, expect, it } from 'vitest'
import type { Member, Message } from '../../../api/circles'
import {
  CHAT_EVERY,
  CHAT_GATHER,
  GROUP_GAP_MS,
  SAY_MAX,
  announceDelay,
  batchSay,
  groupMessages,
  patchMessage,
  slowModeSeconds,
  upsertMessage,
  worthSaying,
} from './grouping'

const T0 = Date.parse('2026-10-09T10:00:00Z')
let next = 1
const msg = (over: Partial<Message> = {}): Message => ({
  id: next++,
  activityId: 'presentation',
  memberId: 'amina',
  kind: 'member',
  text: 'Hello',
  at: new Date(T0).toISOString(),
  likes: 0,
  liked: false,
  hidden: false,
  replyToId: null,
  ...over,
})
const at = (s: number) => new Date(T0 + s * 1000).toISOString()
const member = (id: string, name: string): Member => ({ id, name, role: 'participant', character: 'fox', ring: 0 })

describe('groupMessages', () => {
  it('groups one sender’s consecutive messages under one key', () => {
    const a = msg({ at: at(0) })
    const b = msg({ at: at(5) })
    const c = msg({ memberId: 'kenji', at: at(6) })
    const d = msg({ at: at(7) })
    const items = groupMessages([a, b, c, d])
    expect(items.map((i) => i.kind === 'group' && [i.memberId, i.messages.map((m) => m.id)])).toEqual([
      ['amina', [a.id, b.id]],
      ['kenji', [c.id]],
      ['amina', [d.id]],
    ])
    expect(items[0]!.key).toBe(`g${a.id}`)
  })

  it('starts a new group after a long pause, a system line or a circloo answer', () => {
    const a = msg({ at: at(0) })
    const late = msg({ at: new Date(T0 + GROUP_GAP_MS + 1000).toISOString() })
    const sys = msg({ kind: 'system', memberId: 'amina', text: 'start:presentation', at: at(400) })
    const after = msg({ at: at(401) })
    const ai = msg({ kind: 'ai', memberId: null, text: 'Hi', at: at(402) })
    const last = msg({ at: at(403) })
    const items = groupMessages([a, late, sys, after, ai, last])
    expect(items.map((i) => i.kind)).toEqual(['group', 'group', 'system', 'group', 'ai', 'group'])
  })

  it('keeps the group key while the group grows', () => {
    const a = msg({ at: at(0) })
    const first = groupMessages([a])
    const grown = groupMessages([a, msg({ at: at(1) })])
    expect(grown[0]!.key).toBe(first[0]!.key)
  })
})

describe('upsertMessage and patchMessage', () => {
  it('adds a new message in id order', () => {
    const a = msg()
    const c = msg()
    const b = { ...msg(), id: a.id + 0.5 }
    expect(upsertMessage([a, c], b).map((m) => m.id)).toEqual([a.id, b.id, c.id])
    expect(upsertMessage([a], c).map((m) => m.id)).toEqual([a.id, c.id])
  })

  it('replaces a known message instead of dropping the update, and keeps your like', () => {
    const a = msg({ likes: 2, liked: true })
    const again = { ...a, likes: 3, liked: false, hidden: true }
    const out = upsertMessage([a], again)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ likes: 3, liked: true, hidden: true })
  })

  it('patches likes and your like, and ignores unknown ids', () => {
    const a = msg()
    const list = [a]
    expect(patchMessage(list, a.id, { likes: 4 })[0]!.likes).toBe(4)
    expect(patchMessage(list, a.id, { liked: true })[0]!.liked).toBe(true)
    expect(patchMessage(list, 999_999, { likes: 1 })).toBe(list)
  })
})

describe('announcements', () => {
  it('only says messages from others, circloo included, never system lines or yours', () => {
    expect(worthSaying(msg({ memberId: 'kenji' }), 'amina')).toBe(true)
    expect(worthSaying(msg({ memberId: 'amina' }), 'amina')).toBe(false)
    expect(worthSaying(msg({ kind: 'system', memberId: 'kenji' }), 'amina')).toBe(false)
    expect(worthSaying(msg({ kind: 'ai', memberId: null }), 'amina')).toBe(true)
  })

  it('reads one message with its sender, and a burst as a count', () => {
    const people = [member('kenji', 'Kenji')]
    expect(batchSay([], people)).toEqual({ kind: 'none' })
    expect(batchSay([msg({ memberId: 'kenji', text: 'Bravo  👏\nso good' })], people)).toEqual({ kind: 'one', name: 'Kenji', text: 'Bravo 👏 so good' })
    expect(batchSay([msg(), msg(), msg()], people)).toEqual({ kind: 'many', count: 3 })
    expect(batchSay([msg({ kind: 'ai', memberId: null })], people)).toMatchObject({ kind: 'one', name: 'circloo' })
  })

  it('cuts a long message', () => {
    const say = batchSay([msg({ memberId: 'kenji', text: 'a'.repeat(280) })], [member('kenji', 'Kenji')])
    expect(say.kind === 'one' && say.text.length).toBe(SAY_MAX)
  })

  it('gathers first, then waits a few seconds between announcements', () => {
    expect(announceDelay(0, T0)).toBe(CHAT_GATHER)
    expect(announceDelay(T0, T0 + 1000)).toBe(CHAT_EVERY - 1000)
    expect(announceDelay(T0, T0 + CHAT_EVERY + 5000)).toBe(CHAT_GATHER)
  })
})

describe('slow mode', () => {
  it('reads the hub’s slow-mode code', () => {
    expect(slowModeSeconds('slow-mode:7')).toBe(7)
    expect(slowModeSeconds('slow-mode:99')).toBe(10)
    expect(slowModeSeconds('slow-down')).toBeNull()
    expect(slowModeSeconds('chat-paused')).toBeNull()
  })
})
