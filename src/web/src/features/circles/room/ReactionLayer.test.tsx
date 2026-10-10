import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import i18n from '../../../i18n'
import { ReactionLayer } from './ReactionLayer'
import { ReactionTally } from './ReactionTally'
import { MAX_MOVING, useReactions, type BurstEntry, type ReactionCounts } from './reactions'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('../../../lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/motion')>()),
  useReducedMotion: () => motion.reduced,
}))

const entry = (id: number, burst: BurstEntry['burst']): BurstEntry => ({ id, at: Date.now(), burst })

beforeEach(() => {
  motion.reduced = false
})
afterEach(() => {
  useReactions.getState().reset()
  vi.useRealTimers()
  void i18n.changeLanguage('en')
})

describe('ReactionLayer', () => {
  it('lets at most 12 emoji move for a burst of 40 and frees a slot when one lands', () => {
    const { container, rerender } = render(<ReactionLayer bursts={[]} />)
    const layer = container.querySelector('.reaction-layer')!
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    rerender(<ReactionLayer bursts={[entry(1, { clap: 40 })]} />)
    const floats = container.querySelectorAll('.reaction-layer__float')
    expect(floats).toHaveLength(MAX_MOVING)
    // Full: the next burst only feeds the tally.
    rerender(<ReactionLayer bursts={[entry(1, { clap: 40 }), entry(2, { heart: 3 })]} />)
    expect(container.querySelectorAll('.reaction-layer__float')).toHaveLength(MAX_MOVING)
    // jsdom has no AnimationEvent, so React listens for the prefixed name there.
    fireEvent(floats[0]!, new Event('webkitAnimationEnd', { bubbles: true }))
    expect(container.querySelectorAll('.reaction-layer__float')).toHaveLength(MAX_MOVING - 1)
    rerender(<ReactionLayer bursts={[entry(2, { heart: 3 }), entry(3, { heart: 3 })]} />)
    expect(container.querySelectorAll('.reaction-layer__float')).toHaveLength(MAX_MOVING)
    expect(container.querySelectorAll('.reaction-layer__float[data-kind="heart"]')).toHaveLength(1)
  })

  it('does not replay what arrived before it showed', () => {
    const { container } = render(<ReactionLayer bursts={[entry(7, { clap: 5 })]} />)
    expect(container.querySelectorAll('.reaction-layer__float')).toHaveLength(0)
  })

  it('floats nothing under reduced motion', () => {
    motion.reduced = true
    const { container, rerender } = render(<ReactionLayer bursts={[]} />)
    rerender(<ReactionLayer bursts={[entry(1, { clap: 4 })]} />)
    expect(container.querySelector('.reaction-layer')).toBeNull()
  })
})

describe('ReactionTally', () => {
  it('shows one grouped chip per kind, in the fixed kind order', () => {
    const { container } = render(<ReactionTally waves={{ heart: { count: 3, at: 0 }, clap: { count: 40, at: 0 } }} totals={{}} />)
    const chips = [...container.querySelectorAll('.reaction-tally__chip')]
    expect(chips.map((c) => c.textContent)).toEqual(['👏×40', '❤️×3'])
    expect(chips[0]).toHaveAttribute('data-count', '40')
    expect(chips[0]).toHaveAttribute('aria-hidden', 'true')
  })

  it('is a still counter under reduced motion', () => {
    motion.reduced = true
    const { container } = render(<ReactionTally waves={{ clap: { count: 5, at: 0 } }} totals={{}} />)
    expect(container.querySelector('.reaction-tally')).toHaveClass('is-still')
    expect(container.querySelector('.reaction-tally__chip')).toHaveTextContent('×5')
  })

  it('tells screen readers one grouped summary at most every few seconds', () => {
    vi.useFakeTimers()
    // Development mode mounts twice: the summary must survive it.
    const tally = (totals: ReactionCounts) => <StrictMode><ReactionTally waves={{}} totals={totals} /></StrictMode>
    const { rerender } = render(tally({}))
    const status = screen.getByRole('status')
    rerender(tally({ clap: 4 }))
    rerender(tally({ clap: 12, heart: 3 }))
    expect(status).toHaveTextContent('')
    act(() => vi.advanceTimersByTime(1_000))
    expect(status).toHaveTextContent('12 applause, 3 hearts')
    // More arrives at once: it waits for its turn, then says only what is new.
    rerender(tally({ clap: 14, heart: 3 }))
    act(() => vi.advanceTimersByTime(2_900))
    expect(status).not.toHaveTextContent(/^2 applause$/)
    // Four seconds after the first summary.
    act(() => vi.advanceTimersByTime(1_200))
    expect(status).toHaveTextContent(/^2 applause$/)
  })

  it('speaks the reader language, and a display can stay quiet', () => {
    vi.useFakeTimers()
    void i18n.changeLanguage('ar')
    const { rerender } = render(<ReactionTally waves={{}} totals={{}} />)
    rerender(<ReactionTally waves={{}} totals={{ clap: 2 }} />)
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByRole('status')).toHaveTextContent('تصفيقتان')
    void i18n.changeLanguage('en')
    rerender(<ReactionTally waves={{}} totals={{ clap: 2 }} announce={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
