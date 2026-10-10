import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import '../../../i18n'
import type { DiscussionState } from '../../../api/circles'
import { clock, secondsLeft } from './away'
import { CallPanel } from './CallPanel'
import { resetStage, useStage } from './stage'

const state = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: true, videoAllowed: true, speaking: 'hand', available: true, away: 'none', awayEndsAt: null, ...over })

afterEach(() => {
  resetStage()
  vi.useRealTimers()
})

describe('the animator-away countdown', () => {
  it('counts whole seconds, never below zero', () => {
    const now = Date.parse('2026-10-09T10:00:00Z')
    expect(secondsLeft('2026-10-09T10:05:00Z', now)).toBe(300)
    expect(secondsLeft('2026-10-09T10:00:00.400Z', now)).toBe(1)
    expect(secondsLeft('2026-10-09T09:59:00Z', now)).toBe(0)
    expect(secondsLeft(null, now)).toBeNull()
    expect(secondsLeft('not a date', now)).toBeNull()
  })

  it('reads as minutes and two-digit seconds', () => {
    expect(clock(300)).toBe('5:00')
    expect(clock(65)).toBe('1:05')
    expect(clock(9)).toBe('0:09')
  })

  it('shows in the Call tab while no animator is connected, ticking once a second, and goes when one is back', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] })
    vi.setSystemTime(Date.parse('2026-10-09T10:00:00Z'))
    useStage.setState({ discussion: state({ away: 'away', awayEndsAt: '2026-10-09T10:05:00Z' }) })
    render(<CallPanel isAnimator={false} />)
    expect(screen.getByText('The animator is away.')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('timer')).toHaveTextContent('5:00')
    act(() => vi.advanceTimersByTime(61_000))
    expect(screen.getByRole('timer')).toHaveTextContent('3:59')
    act(() => useStage.setState({ discussion: state() }))
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('shows nothing while the call is off', () => {
    useStage.setState({ discussion: state({ on: false, away: 'away', awayEndsAt: '2026-10-09T10:05:00Z' }) })
    render(<CallPanel isAnimator={false} />)
    expect(screen.queryByRole('timer')).toBeNull()
  })
})
