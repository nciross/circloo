import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import i18n from '../../../i18n'
import { JOINS_WINDOW, diffPeople, joinsText, useJoinsAnnouncement } from './joins'

const t = i18n.getFixedT('en')
const names: Record<string, string> = { a: 'Amina', b: 'Théo', c: 'Lucía', d: 'Youssef' }
const nameOf = (id: string) => names[id] ?? id

afterEach(() => vi.useRealTimers())

describe('joins and leaves', () => {
  it('finds who arrived and who went', () => {
    expect(diffPeople(['a', 'b'], ['b', 'c'])).toEqual({ joined: ['c'], left: ['a'] })
  })

  it('says one name, two names or a count', () => {
    expect(joinsText(t, { joined: ['Amina'], left: [] })).toBe('Amina joined the call.')
    expect(joinsText(t, { joined: ['Amina', 'Théo'], left: [] })).toBe('Amina and Théo joined the call.')
    expect(joinsText(t, { joined: ['Amina', 'Théo', 'Lucía'], left: ['Youssef'] })).toBe('3 people joined the call. Youssef left the call.')
  })

  it('groups a burst into one sentence and stays quiet about the list you found', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ ids }) => useJoinsAnnouncement(ids, nameOf, t), { initialProps: { ids: ['a'] } })
    expect(result.current).toBe('')
    rerender({ ids: ['a', 'b'] })
    rerender({ ids: ['a', 'b', 'c'] })
    rerender({ ids: ['a', 'b', 'c', 'd'] })
    rerender({ ids: ['a', 'b', 'c'] })
    expect(result.current).toBe('')
    act(() => vi.advanceTimersByTime(JOINS_WINDOW))
    expect(result.current).toBe('Théo and Lucía joined the call.')
    rerender({ ids: ['b', 'c'] })
    act(() => vi.advanceTimersByTime(JOINS_WINDOW))
    expect(result.current).toBe('Amina left the call.')
  })
})
