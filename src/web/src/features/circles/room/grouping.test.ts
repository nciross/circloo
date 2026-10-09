import { describe, expect, it } from 'vitest'
import i18n from '../../../i18n'
import type { Member, Message } from '../../../api/circles'
import {
  CHAT_EVERY,
  CHAT_GATHER,
  GROUP_GAP_MS,
  SAY_MAX,
  announceDelay,
  batchSay,
  groupMessages,
  isThreaded,
  patchMessage,
  sayText,
  slowModeSeconds,
  threadsOf,
  upsertMessage,
  worthSaying,
  type ChatItem,
} from './grouping'
import type { LiveLine } from './liveLines'

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

  it('reads a reply with whom it answers: a member, you, or a message no longer here', () => {
    const people = [member('kenji', 'Kenji'), member('amina', 'Amina')]
    const parent = msg({ id: 40, memberId: 'amina', text: 'Who brings the cake?' })
    const reply = msg({ id: 41, memberId: 'kenji', text: 'Me!', replyToId: 40 })
    expect(batchSay([reply], people, [parent, reply], 'lucia')).toEqual({ kind: 'one', name: 'Kenji', text: 'Me!', reply: { name: 'Amina', mine: false } })
    expect(batchSay([reply], people, [parent, reply], 'amina')).toMatchObject({ reply: { name: 'Amina', mine: true } })
    expect(batchSay([reply], people, [reply], 'lucia')).toMatchObject({ reply: 'earlier' })
    const t = i18n.getFixedT('en')
    expect(sayText(t, batchSay([reply], people, [parent, reply], 'lucia'))).toBe('Kenji, replying to Amina: Me!')
    expect(sayText(t, batchSay([reply], people, [parent, reply], 'amina'))).toBe('Kenji, replying to you: Me!')
    expect(sayText(t, batchSay([reply], people, [reply], 'lucia'))).toBe('Kenji, replying to an earlier message: Me!')
    expect(sayText(t, batchSay([msg({ memberId: 'kenji', text: 'Hi' })], people))).toBe('Kenji: Hi')
    expect(sayText(i18n.getFixedT('ar'), batchSay([reply], people, [parent, reply], 'lucia'))).toBe('Kenji، ردًّا على Amina: Me!')
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

describe('threads and live lines (spec 009 US5)', () => {
  const line = (seq: number, afterId: number, event: LiveLine['event'], at = 0): LiveLine => ({ seq, afterId, activityId: 'presentation', at, event })
  const shape = (items: ChatItem[]) =>
    items.map((i) =>
      i.kind === 'group' ? `${i.memberId}:${i.messages.map((m) => m.id).join(',')}`
      : i.kind === 'replied' ? `replied:${i.message.id}`
      : i.kind === 'live' ? `live:${i.line.kind === 'hands' ? `${i.line.dir}${i.line.memberIds.length}` : i.line.kind}`
      : i.kind,
    )

  it('puts a reply under its message, out of the flow, so it splits no one’s run', () => {
    const a = msg({ at: at(0) })
    const reply = msg({ memberId: 'kenji', replyToId: a.id, at: at(1) })
    const b = msg({ at: at(2) })
    const items = groupMessages([a, reply, b])
    expect(shape(items)).toEqual([`amina:${a.id},${b.id}`])
    expect(threadsOf([a, reply, b]).get(a.id)).toEqual([reply])
    expect(isThreaded(reply, threadsOf([a, reply, b]))).toBe(true)
  })

  it('marks a reply that lands away from its message where it happened, and that line starts a new run', () => {
    const a = msg({ at: at(0) })
    const k = msg({ memberId: 'kenji', at: at(1) })
    const l = msg({ memberId: 'lucia', at: at(2) })
    const reply = msg({ memberId: 'kenji', replyToId: a.id, at: at(3) })
    const second = msg({ memberId: 'lucia', replyToId: a.id, at: at(4) })
    const l2 = msg({ memberId: 'lucia', at: at(5) })
    const items = groupMessages([a, k, l, reply, second, l2])
    // The second reply follows the first one: one pointer for the pair. Lucía's runs are split by the pointer.
    expect(shape(items)).toEqual([`amina:${a.id}`, `kenji:${k.id}`, `lucia:${l.id}`, `replied:${reply.id}`, `lucia:${l2.id}`])
    expect(threadsOf([a, k, l, reply, second, l2]).get(a.id)!.map((m) => m.id)).toEqual([reply.id, second.id])
  })

  it('keeps a reply whose message is not loaded in the flow, as a message of its own', () => {
    const lone = msg({ memberId: 'kenji', replyToId: 9999, at: at(0) })
    const after = msg({ memberId: 'kenji', at: at(1) })
    expect(shape(groupMessages([lone, after]))).toEqual([`kenji:${lone.id},${after.id}`])
    expect(threadsOf([lone, after]).size).toBe(0)
  })

  it('never threads under a reply: one level only', () => {
    const a = msg({ at: at(0) })
    const r1 = msg({ memberId: 'kenji', replyToId: a.id, at: at(1) })
    const r2 = msg({ memberId: 'lucia', replyToId: r1.id, at: at(2) })
    const threads = threadsOf([a, r1, r2])
    expect([...threads.keys()]).toEqual([a.id])
    expect(shape(groupMessages([a, r1, r2]))).toEqual([`amina:${a.id}`, `lucia:${r2.id}`])
  })

  it('places live lines after the message that was newest, splitting a run, and groups a burst of hands', () => {
    const a = msg({ at: at(0) })
    const b = msg({ at: at(1) })
    const lines = [
      line(1, a.id, { kind: 'notice', notice: 'call-started', by: 'theo' }),
      line(2, b.id, { kind: 'hand-up', memberId: 'kenji' }),
      line(3, b.id, { kind: 'hand-up', memberId: 'lucia' }, 10),
      line(4, b.id, { kind: 'hand-up', memberId: 'sam' }, 20),
    ]
    expect(shape(groupMessages([a, b], undefined, lines))).toEqual([`amina:${a.id}`, 'live:notice', `amina:${b.id}`, 'live:up3'])
    // With no message yet, the lines are the whole conversation.
    expect(shape(groupMessages([], undefined, lines.slice(0, 1)))).toEqual(['live:notice'])
  })

  it('keeps the reply link of a message that arrives live', () => {
    const a = msg()
    const live = msg({ memberId: 'kenji', replyToId: a.id })
    expect(upsertMessage([a], live)[1]!.replyToId).toBe(a.id)
    const { replyToId: _drop, ...bare } = msg({ memberId: 'kenji' })
    expect(upsertMessage([a], bare as Message)[1]!.replyToId).toBeNull()
  })
})
