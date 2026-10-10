import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { ReactionLayer } from '../features/circles/room/ReactionLayer'
import { ReactionTally } from '../features/circles/room/ReactionTally'
import type { BurstEntry } from '../features/circles/room/reactions'
import { useReducedMotion } from './motion'

// Spec 009 T914 (found in #267): the reduced-motion setting is followed live. The `useReducedMotion` of `motion` read it
// once per component, so switching it on during a call left the emoji floating until a reload.

/** A system setting that can change while the page runs, like the real `prefers-reduced-motion`. */
function systemMotion(reduced: boolean) {
  const listeners = new Set<() => void>()
  const state = { reduced }
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    get matches() {
      return media.includes('prefers-reduced-motion') && state.reduced
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }))
  return {
    set(next: boolean) {
      state.reduced = next
      act(() => listeners.forEach((l) => l()))
    },
    listening: () => listeners.size,
  }
}

function Probe() {
  return <p data-testid="probe">{useReducedMotion() ? 'still' : 'moving'}</p>
}

const burst = (id: number): BurstEntry => ({ id, at: Date.now(), burst: { clap: 3 } })

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

describe('useReducedMotion', () => {
  it('follows the setting when it changes, without a reload, and stops listening when nothing reads it', () => {
    const system = systemMotion(false)
    const { getByTestId, unmount } = render(<Probe />)
    expect(getByTestId('probe')).toHaveTextContent('moving')
    system.set(true)
    expect(getByTestId('probe')).toHaveTextContent('still')
    system.set(false)
    expect(getByTestId('probe')).toHaveTextContent('moving')
    unmount()
    expect(system.listening()).toBe(0)
  })

  it('is false where the browser cannot tell', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('probe')).toHaveTextContent('moving')
  })

  it('stops the floating reactions and stills the counter as soon as the setting goes on', () => {
    const system = systemMotion(false)
    const { container, rerender } = render(
      <>
        <ReactionLayer bursts={[]} />
        <ReactionTally waves={{}} totals={{}} announce={false} />
      </>,
    )
    rerender(
      <>
        <ReactionLayer bursts={[burst(1)]} />
        <ReactionTally waves={{ clap: { count: 3, at: Date.now() } }} totals={{ clap: 3 }} announce={false} />
      </>,
    )
    expect(container.querySelectorAll('.reaction-layer__float').length).toBeGreaterThan(0)
    expect(container.querySelector('.reaction-tally')).not.toHaveClass('is-still')

    system.set(true)
    expect(container.querySelector('.reaction-layer')).toBeNull()
    expect(container.querySelector('.reaction-tally')).toHaveClass('is-still')
    // A burst that arrives now does not float either.
    rerender(
      <>
        <ReactionLayer bursts={[burst(1), burst(2)]} />
        <ReactionTally waves={{ clap: { count: 6, at: Date.now() } }} totals={{ clap: 6 }} announce={false} />
      </>,
    )
    expect(container.querySelector('.reaction-layer')).toBeNull()
  })
})
