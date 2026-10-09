import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { DiscussionState, HandsView, Member } from '../../../api/circles'
import { DEFAULT_SETTINGS, useRoom } from '../room'
import { NO_HANDS } from '../room/hands'
import { useReactions } from '../room/reactions'
import type { CallParticipant } from './call'
import { CallControls } from './CallControls'
import { resetStage, useStage } from './stage'

// Spec 009 T927: the raised hand and the reactions in the call's bar, and the reactions over the call.

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('../../../lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/motion')>()),
  useReducedMotion: () => motion.reduced,
}))

const state = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: true, videoAllowed: true, speaking: 'hand', available: true, away: 'none', awayEndsAt: null, ...over })
const members: Member[] = [
  { id: 'nadia', role: 'animator', name: 'Nadia', character: 'panda', ring: 0 },
  { id: 'amina', role: 'participant', name: 'Amina', character: 'fox', ring: 0 },
  { id: 'theo', role: 'participant', name: 'Théo', character: 'frog', ring: 0 },
] as Member[]
const person = (id: string, over: Partial<CallParticipant> = {}): CallParticipant => ({
  id, name: id, local: false, speaking: false, quality: 'good', mic: false, camera: false, video: null, ...over,
})
const raised = (...ids: string[]): HandsView['queue'] => ids.map((memberId, i) => ({ memberId, raisedAt: `2026-10-09T10:0${i}:00Z` }))

/** In the call as `meId`, in Hand to speak without the floor unless told otherwise. */
function inCall(meId: string, over: { discussion?: DiscussionState; canSpeak?: boolean; hands?: HandsView } = {}) {
  const room = { raiseHand: vi.fn(() => Promise.resolve()), lowerHand: vi.fn(() => Promise.resolve()), react: vi.fn() }
  useRoom.setState({ me: members.find((m) => m.id === meId)!, members, hands: over.hands ?? NO_HANDS, settings: DEFAULT_SETTINGS, ...room })
  useStage.setState({
    discussion: over.discussion ?? state(),
    connection: 'connected',
    myPermissions: { canSpeak: over.canSpeak ?? false, canVideo: true },
    participants: [person(meId, { local: true }), person('nadia')],
  })
  return room
}

function phone(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: on, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
}

const devices = (container: HTMLElement) => [...container.querySelectorAll('.call-bar__devices > button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)

beforeEach(() => {
  motion.reduced = false
  phone(false)
})
afterEach(() => {
  resetStage()
  useRoom.setState({ me: null, members: [], hands: NO_HANDS, settings: DEFAULT_SETTINGS })
  useReactions.getState().reset()
  vi.unstubAllGlobals()
})

describe('CallControls: the hand (T927)', () => {
  it('puts Raise hand in place of the microphone in Hand to speak, first in the bar', async () => {
    const room = inCall('amina')
    const { container } = render(<CallControls members={members} view="call" />)
    expect(screen.queryByRole('button', { name: 'Microphone' })).toBeNull()
    expect(devices(container)).toEqual(['Raise hand', 'Camera'])
    await userEvent.click(screen.getByRole('button', { name: 'Raise hand' }))
    expect(room.raiseHand).toHaveBeenCalled()
  })

  it('shows the place in the queue on the hand, and says it in its name', () => {
    inCall('amina', { hands: { queue: raised('theo', 'amina'), floor: null } })
    render(<CallControls members={members} view="call" />)
    const hand = screen.getByRole('button', { name: 'Lower hand, You are 2nd' })
    expect(hand).toHaveAttribute('data-hand', 'queue')
    expect(hand.querySelector('.hand-btn__place')).toHaveTextContent('2')
  })

  it('gives the microphone back with the floor, the hand after the devices, and moves the focus to the microphone', async () => {
    inCall('amina', { hands: { queue: raised('amina'), floor: null } })
    const { container } = render(<CallControls members={members} view="call" />)
    screen.getByRole('button', { name: /Lower hand/ }).focus()
    act(() => {
      useRoom.setState({ hands: { queue: [], floor: 'amina' } })
      useStage.setState({ myPermissions: { canSpeak: true, canVideo: true } })
    })
    expect(devices(container)).toEqual(['Microphone', 'Camera', 'I’m done'])
    expect(screen.getByRole('button', { name: 'Microphone' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'I’m done' })).toHaveAttribute('data-hand', 'floor')
  })

  it('keeps the microphone in Open mic, the hand as a signal beside it; the animator has no hand', () => {
    inCall('amina', { discussion: state({ speaking: 'open' }), canSpeak: true })
    const { container, unmount } = render(<CallControls members={members} view="call" />)
    expect(devices(container)).toEqual(['Microphone', 'Camera', 'Raise hand'])
    unmount()
    inCall('nadia', { canSpeak: true })
    const animator = render(<CallControls members={members} view="call" />)
    expect(devices(animator.container)).toEqual(['Microphone', 'Camera'])
  })

  it('says a refusal of the hand in the bar', async () => {
    const room = inCall('amina')
    room.raiseHand.mockRejectedValueOnce(new Error('HubException: slow-down'))
    render(<CallControls members={members} view="call" />)
    await userEvent.click(screen.getByRole('button', { name: 'Raise hand' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Easy there: wait a few seconds before raising your hand again.')
  })
})

describe('CallControls: reactions (T927)', () => {
  it('has the six reactions in the bar on a computer, and sends one per tap', async () => {
    const room = inCall('amina')
    render(<CallControls members={members} view="call" />)
    const bar = screen.getByRole('group', { name: 'Send a reaction' })
    expect(within(bar).getAllByRole('button')).toHaveLength(6)
    await userEvent.click(within(bar).getByRole('button', { name: 'Applause' }))
    expect(room.react).toHaveBeenCalledWith('clap')
  })

  it('opens them as a row above the bar on a phone; Escape closes it and gives the focus back', async () => {
    phone(true)
    const room = inCall('amina')
    render(<CallControls members={members} view="call" />)
    const toggle = screen.getByRole('button', { name: 'Reactions' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: 'Send a reaction' })).toBeNull()
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const tray = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(tray).toHaveClass('call-bar__tray')
    await userEvent.click(within(tray).getByRole('button', { name: 'Celebrate' }))
    await userEvent.click(within(tray).getByRole('button', { name: 'Applause' }))
    expect(room.react.mock.calls).toEqual([['party'], ['clap']])
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Send a reaction' })).toBeNull()
    expect(toggle).toHaveFocus()
  })

  it('floats the grouped burst over the call, with its count, and a summary for screen readers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    inCall('amina')
    const { container } = render(<CallControls members={members} view="call" />)
    act(() => useReactions.getState().receive({ clap: 20 }))
    const over = container.querySelector('[data-slot="call-reactions"]')!
    expect(over.querySelector('.reaction-layer')).toHaveAttribute('data-moving', '12')
    expect(over.querySelector('.reaction-tally__chip[data-kind="clap"]')).toHaveAttribute('data-count', '20')
    act(() => vi.advanceTimersByTime(1100))
    expect(within(over as HTMLElement).getByRole('status')).toHaveTextContent('20 applause')
    vi.useRealTimers()
  })

  it('is a still counter under reduced motion', () => {
    motion.reduced = true
    inCall('amina')
    const { container } = render(<CallControls members={members} view="call" />)
    act(() => useReactions.getState().receive({ heart: 3 }))
    const over = container.querySelector('[data-slot="call-reactions"]')!
    expect(over.querySelector('.reaction-layer')).toBeNull()
    expect(over.querySelector('.reaction-tally')).toHaveClass('is-still')
    expect(over.querySelector('.reaction-tally__chip[data-kind="heart"]')).toHaveAttribute('data-count', '3')
  })

  it('goes when the animator switches reactions off, and steps aside for a presentation in view', () => {
    inCall('amina')
    const { container, rerender } = render(<CallControls members={members} view="call" />)
    expect(screen.getByRole('group', { name: 'Send a reaction' })).toBeInTheDocument()
    act(() => useRoom.setState({ settings: { ...DEFAULT_SETTINGS, reactions: false } }))
    expect(screen.queryByRole('group', { name: 'Send a reaction' })).toBeNull()
    expect(container.querySelector('[data-slot="call-reactions"]')).toBeNull()
    act(() => useRoom.setState({ settings: DEFAULT_SETTINGS }))
    rerender(<CallControls members={members} view="round" reactions={false} />)
    expect(screen.queryByRole('group', { name: 'Send a reaction' })).toBeNull()
    expect(container.querySelector('[data-slot="call-reactions"]')).toBeNull()
    // The hand stays: it is the call's, not the presentation's.
    expect(screen.getByRole('button', { name: 'Raise hand' })).toBeInTheDocument()
  })
})
