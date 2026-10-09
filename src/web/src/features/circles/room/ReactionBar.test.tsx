import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import { DEFAULT_SETTINGS, useRoom } from '../room'
import { ReactionBar } from './ReactionBar'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('../../../lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/motion')>()),
  useReducedMotion: () => motion.reduced,
}))

const react = vi.fn()

beforeEach(() => {
  motion.reduced = false
  react.mockReset()
  useRoom.setState({ settings: DEFAULT_SETTINGS, react })
})
afterEach(() => vi.useRealTimers())

describe('ReactionBar', () => {
  it('offers six labelled reactions of at least 44px that send on tap', async () => {
    render(<ReactionBar />)
    const group = screen.getByRole('group', { name: 'Send a reaction' })
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Applause', 'Love', 'Laughter', 'Wow', 'Thumbs up', 'Celebrate'])
    expect(group).toContainElement(buttons[0]!)
    await userEvent.click(screen.getByRole('button', { name: 'Love' }))
    expect(react).toHaveBeenCalledWith('heart')
    // Your own tap shows at once: the emoji hops off the button.
    expect(screen.getByRole('button', { name: 'Love' }).querySelector('.reaction-bar__pop')).not.toBeNull()
  })

  it('is hidden when the animator switched reactions off', () => {
    useRoom.setState({ settings: { ...DEFAULT_SETTINGS, reactions: false } })
    render(<ReactionBar />)
    expect(screen.queryByRole('group', { name: 'Send a reaction' })).toBeNull()
    act(() => useRoom.setState({ settings: DEFAULT_SETTINGS }))
    expect(screen.getByRole('group', { name: 'Send a reaction' })).toBeInTheDocument()
  })

  it('rests kindly after five taps in ten seconds, then sends again', () => {
    vi.useFakeTimers()
    render(<ReactionBar />)
    const clap = screen.getByRole('button', { name: 'Applause' })
    for (let i = 0; i < 7; i++) act(() => clap.click())
    expect(react).toHaveBeenCalledTimes(5)
    expect(screen.getByRole('status')).toHaveTextContent('Five reactions is the limit for now.')
    expect(clap).toHaveAttribute('aria-disabled', 'true')
    act(() => vi.advanceTimersByTime(10_100))
    expect(screen.getByRole('status')).toHaveTextContent('')
    expect(clap).not.toHaveAttribute('aria-disabled')
    act(() => clap.click())
    expect(react).toHaveBeenCalledTimes(6)
  })

  it('lights the button instead of moving under reduced motion', () => {
    vi.useFakeTimers()
    motion.reduced = true
    render(<ReactionBar />)
    const party = screen.getByRole('button', { name: 'Celebrate' })
    act(() => party.click())
    expect(party).toHaveClass('is-sent')
    expect(party.querySelector('.reaction-bar__pop')).toBeNull()
    act(() => vi.advanceTimersByTime(500))
    expect(party).not.toHaveClass('is-sent')
  })
})
