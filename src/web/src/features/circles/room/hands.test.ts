import { describe, expect, it } from 'vitest'
import type { Member } from '../../../api/circles'
import { cleanHands, listNames, myHand, newlyRaised, NO_HANDS, queueMembers, sameHand, waitedMinutes } from './hands'

const at = '2026-10-09T10:00:00Z'
const view = (ids: string[], floor: string | null = null) => ({ queue: ids.map((memberId) => ({ memberId, raisedAt: at })), floor })

describe('hands', () => {
  it('keeps only well-formed hands from the wire, once each, in the order sent', () => {
    expect(cleanHands(null)).toEqual(NO_HANDS)
    expect(cleanHands({ queue: 'x', floor: 3 })).toEqual(NO_HANDS)
    expect(cleanHands({ queue: [{ memberId: 'b', raisedAt: at }, { memberId: 7 }, null, { memberId: 'a', raisedAt: at }, { memberId: 'b', raisedAt: at }], floor: 'c' }))
      .toEqual({ queue: [{ memberId: 'b', raisedAt: at }, { memberId: 'a', raisedAt: at }], floor: 'c' })
  })

  it('says where you stand: the floor, a place from 1, or nothing', () => {
    expect(myHand(view(['a', 'b', 'c']), 'c')).toEqual({ kind: 'queue', place: 3 })
    expect(myHand(view(['b'], 'a'), 'a')).toEqual({ kind: 'floor' })
    expect(myHand(view(['b']), 'z')).toEqual({ kind: 'none' })
    expect(myHand(view(['b']), undefined)).toEqual({ kind: 'none' })
    expect(sameHand({ kind: 'queue', place: 2 }, { kind: 'queue', place: 2 })).toBe(true)
    expect(sameHand({ kind: 'queue', place: 2 }, { kind: 'queue', place: 1 })).toBe(false)
    expect(sameHand({ kind: 'floor' }, { kind: 'none' })).toBe(false)
  })

  it('finds the hands that just went up, not the ones moving up the line or given the floor', () => {
    expect(newlyRaised(view(['a', 'b']), view(['b', 'c', 'd'], 'a'))).toEqual(['c', 'd'])
    expect(newlyRaised(view([], 'a'), view(['a']))).toEqual([])
    expect(newlyRaised(NO_HANDS, view(['a']))).toEqual(['a'])
  })

  it('counts whole minutes waited, never below zero', () => {
    const t = Date.parse(at)
    expect(waitedMinutes(at, t + 59_000)).toBe(0)
    expect(waitedMinutes(at, t + 125_000)).toBe(2)
    expect(waitedMinutes(at, t - 5_000)).toBe(0)
    expect(waitedMinutes('not a date', t)).toBe(0)
  })

  it('lists names the way each language does, and skips hands of people who left', () => {
    expect(listNames(['Amina', 'Kenji', 'Lucía'], 'en')).toBe('Amina, Kenji, and Lucía')
    expect(listNames(['Amina', 'Kenji'], 'fr')).toBe('Amina et Kenji')
    const members: Member[] = [{ id: 'a', name: 'Amina', role: 'participant', character: 'robot', ring: 0 }]
    expect(queueMembers(view(['x', 'a']), members).map((h) => h.member.name)).toEqual(['Amina'])
  })
})
