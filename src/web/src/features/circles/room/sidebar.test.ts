import { describe, expect, it } from 'vitest'
import type { Member, Message } from '../../../api/circles'
import { formatElapsed, loadSideOpen, matchesName, peopleRows, roundProgress, roundStartedAt, saveSideOpen, unreadCount, windowRows, WINDOW_FROM } from './sidebar'

const m = (id: string, name: string, role: Member['role'] = 'participant'): Member => ({ id, name, role, character: 'fox', ring: 0 })
const msg = (id: number, memberId: string | null, kind: Message['kind'] = 'member'): Message => ({ id, activityId: 'chat', memberId, kind, text: 'x', at: '', likes: 0, liked: false, hidden: false, replyToId: null })

describe('peopleRows', () => {
  const members = [m('p1', 'Théo'), m('a1', 'Amina', 'animator'), m('p2', 'Lucía'), m('p3', 'Bao'), m('a2', 'Zed', 'animator')]

  it('puts people here first, then away, the animator leading each group, with group sizes', () => {
    const { rows, here, away } = peopleRows(members, ['p1', 'a2'], 'p3', '')
    const names = rows.map((r) => (r.kind === 'head' ? `#${r.key}${r.count}` : r.member.name))
    expect(names).toEqual(['#here3', 'Zed', 'Bao', 'Théo', '#away2', 'Amina', 'Lucía'])
    expect([here, away]).toEqual([3, 2])
  })

  it('always counts you as here and numbers people in order', () => {
    const { rows } = peopleRows(members, [], 'p2', '')
    const people = rows.filter((r) => r.kind === 'person')
    expect(people.map((r) => r.index)).toEqual([0, 1, 2, 3, 4])
    expect(people[0]?.kind === 'person' && people[0].member.id).toBe('p2')
  })

  it('searches by name without caring for case or accents and drops empty groups', () => {
    const { rows, found } = peopleRows(members, ['p2'], undefined, ' LUCIA')
    expect(found).toBe(1)
    expect(rows.map((r) => r.kind)).toEqual(['head', 'person'])
    expect(peopleRows(members, [], undefined, 'nobody').rows).toEqual([])
  })
})

describe('matchesName', () => {
  it('matches Arabic and accented names as typed', () => {
    expect(matchesName('أمينة', 'أم')).toBe(true)
    expect(matchesName('Zoë', 'zoe')).toBe(true)
    expect(matchesName('Zoë', 'x')).toBe(false)
  })
})

describe('windowRows', () => {
  it('draws everything up to the threshold', () => {
    expect(windowRows(WINDOW_FROM, 52, 400, 300)).toEqual({ start: 0, end: WINDOW_FROM, before: 0, after: 0 })
  })

  it('draws only what is in view, plus a margin, and keeps the scroll height', () => {
    const w = windowRows(100, 50, 1000, 400)
    expect(w.start).toBe(14)
    expect(w.end).toBe(34)
    expect(w.before + w.after + (w.end - w.start) * 50).toBe(5000)
  })

  it('stays inside the list at both ends', () => {
    expect(windowRows(100, 50, 0, 400).start).toBe(0)
    const end = windowRows(100, 50, 99999, 400)
    expect(end.end).toBe(100)
    expect(end.start).toBeLessThan(100)
  })
})

describe('unreadCount', () => {
  it('counts what others said since you last looked, not system lines or your own', () => {
    const list = [msg(1, 'a'), msg(2, 'b'), msg(3, null, 'system'), msg(4, 'me'), msg(5, 'b'), msg(6, null, 'ai')]
    expect(unreadCount(list, 0, 'me')).toBe(4)
    expect(unreadCount(list, 5, 'me')).toBe(1)
    expect(unreadCount(list, 6, 'me')).toBe(0)
  })
})

describe('the running round', () => {
  it('finds when the round opened from its start line, and formats the time that ran', () => {
    const list = [{ ...msg(1, null, 'system'), text: 'start:canvas', at: '2026-10-07T10:00:00Z' }, msg(2, 'a'), { ...msg(3, null, 'system'), text: 'start:retro', at: '2026-10-07T10:05:00Z' }]
    expect(roundStartedAt(list, 'retro')).toBe('2026-10-07T10:05:00Z')
    expect(roundStartedAt(list, 'canvas')).toBe('2026-10-07T10:00:00Z')
    expect(roundStartedAt(list, 'quiz')).toBeNull()
    expect(roundStartedAt(list, null)).toBeNull()
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(247)).toBe('4:07')
    expect(formatElapsed(3750)).toBe('1:02:30')
    expect(roundProgress(450)).toBe(0.5)
    expect(roundProgress(99_999)).toBe(1)
  })
})

describe('the remembered choice', () => {
  it('is open by default and keeps a collapse', () => {
    window.localStorage.clear()
    expect(loadSideOpen()).toBe(true)
    saveSideOpen(false)
    expect(loadSideOpen()).toBe(false)
    saveSideOpen(true)
    expect(loadSideOpen()).toBe(true)
  })
})
