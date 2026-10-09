import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { DiscussionState, Member } from '../../../api/circles'
import type { CallParticipant } from './call'
import { useRoom } from '../room'
import { NO_HANDS } from '../room/hands'
import { CallControls } from './CallControls'
import { CallPanel } from './CallPanel'
import { configureStage, resetStage, useStage } from './stage'

const state = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: false, videoAllowed: true, speaking: 'hand', available: true, away: 'none', awayEndsAt: null, ...over })
const members: Member[] = [
  { id: 'nadia', role: 'animator', name: 'Nadia', character: 'panda', ring: 0 },
  { id: 'amina', role: 'participant', name: 'Amina', character: 'fox', ring: 0 },
  { id: 'theo', role: 'participant', name: 'Théo', character: 'frog', ring: 0 },
] as Member[]
const person = (id: string, over: Partial<CallParticipant> = {}): CallParticipant => ({
  id, name: id, local: false, speaking: false, quality: 'good', mic: false, camera: false, video: null, ...over,
})

beforeEach(() => {
  // jsdom has no WebRTC; the Call tab offers Join only where it exists.
  vi.stubGlobal('RTCPeerConnection', class {})
})

afterEach(() => {
  resetStage()
  useRoom.setState({ hands: NO_HANDS })
  vi.unstubAllGlobals()
})

describe('CallPanel', () => {
  it('gives the animator the three switches, the call off by default', async () => {
    const enable = vi.fn(() => Promise.resolve())
    useStage.setState({ discussion: state(), enableDiscussion: enable })
    render(<CallPanel isAnimator />)
    expect(screen.getAllByRole('switch').map((s) => s.textContent)).toEqual(['Chat', 'Audio call', 'Video call'])
    expect(screen.getByRole('switch', { name: 'Video call' })).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(screen.getByRole('switch', { name: 'Video call' }))
    expect(enable).toHaveBeenCalledWith(true, 'hand')
    expect(screen.queryByText('Soon')).toBeNull()
  })

  it('ends the call from the audio switch, and says so when the hub refuses', async () => {
    const disable = vi.fn(() => Promise.reject(new Error('HubException: animator-only')))
    useStage.setState({ discussion: state({ on: true }), disableDiscussion: disable })
    render(<CallPanel isAnimator />)
    await userEvent.click(screen.getByRole('switch', { name: 'Audio call' }))
    expect(disable).toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the animator can change this.')
  })

  it('tells participants the speaking mode in plain words, and shows them no control', () => {
    useStage.setState({ discussion: state({ on: true }), roster: ['nadia', 'amina'] })
    const { rerender } = render(<CallPanel isAnimator={false} members={members} />)
    expect(screen.getByText('Hand to speak: raise your hand and wait for the floor.')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: /Options for/ })).toBeNull()
    useStage.setState({ discussion: state({ on: true, speaking: 'open' }) })
    rerender(<CallPanel isAnimator={false} members={members} />)
    expect(screen.getByText('Open mic: anyone in the call can speak.')).toBeInTheDocument()
  })

  it('gives the animator a menu on each participant, never on themselves or another animator', () => {
    const team = [...members, { id: 'kenji', role: 'animator', name: 'Kenji', character: 'owl', ring: 0 } as Member]
    useStage.setState({
      discussion: state({ on: true }),
      connection: 'connected',
      participants: [person('nadia', { local: true }), person('amina'), person('theo'), person('kenji')],
    })
    render(<CallPanel isAnimator members={team} />)
    expect(screen.getAllByRole('button', { name: /Options for/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Options for Amina', 'Options for Théo'])
  })

  it('says what the animator switched off, and lists the people removed with a way back', async () => {
    const sent: unknown[][] = []
    configureStage({ circleId: 'c1', deps: { invoke: (...args) => (sent.push(args), Promise.resolve()) } })
    useStage.setState({
      discussion: state({ on: true }),
      connection: 'connected',
      participants: [person('nadia', { local: true }), person('amina', { mic: true, camera: true })],
      moderation: { microphone: ['amina'], camera: ['amina'], removed: ['theo'] },
    })
    render(<CallPanel isAnimator members={members} />)
    const rows = within(screen.getByRole('region', { name: 'In the call' })).getAllByRole('listitem')
    expect(rows[1]).toHaveTextContent('Aminamicrophone off by you · camera off by you')
    const removed = screen.getByRole('region', { name: 'Removed from this call' })
    expect(within(removed).getByRole('listitem')).toHaveTextContent('Théo')
    await userEvent.click(within(removed).getByRole('button', { name: 'Let Théo back into the call' }))
    expect(sent).toEqual([['AllowBack', 'theo']])
    expect(screen.queryByRole('region', { name: 'Removed from this call' })).toBeNull()
    expect(screen.getByText('Théo can join the call again.')).toBeInTheDocument()
    expect(document.activeElement).toHaveAttribute('id', 'call-now-state')
  })

  it('shows participants no call control while calls are off', () => {
    useStage.setState({ discussion: state() })
    render(<CallPanel isAnimator={false} members={members} />)
    expect(screen.getByRole('status')).toHaveTextContent('No call right now.')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('offers Join call with the number of people already in it, and the people by name', async () => {
    const join = vi.fn(() => Promise.resolve())
    useStage.setState({ discussion: state({ on: true }), roster: ['nadia', 'amina'], join })
    useRoom.setState({ hands: { queue: [], floor: 'amina' } })
    render(<CallPanel isAnimator={false} members={members} />)
    expect(screen.getByRole('status')).toHaveTextContent('A video call is on.')
    expect(screen.getByText('2 people in the call')).toBeInTheDocument()
    const list = screen.getByRole('region', { name: 'In the call' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Nadia', 'Aminahas the floor'])
    await userEvent.click(screen.getByRole('button', { name: 'Join call' }))
    expect(join).toHaveBeenCalled()
  })

  it('tells a browser without live audio or video why it cannot join, with no Join button (US4 #6)', () => {
    vi.stubGlobal('RTCPeerConnection', undefined)
    useStage.setState({ discussion: state({ on: true }), roster: ['nadia'] })
    render(<CallPanel isAnimator={false} members={members} />)
    expect(screen.getByText('This browser cannot join the call. You can still chat and raise your hand.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join call' })).toBeNull()
    expect(screen.getByText('1 person in the call')).toBeInTheDocument()
  })

  it('says an audio call is on, and that calls are not available here without a call server', () => {
    useStage.setState({ discussion: state({ on: true, videoAllowed: false }) })
    const { unmount } = render(<CallPanel isAnimator={false} members={members} />)
    expect(screen.getByRole('status')).toHaveTextContent('An audio call is on.')
    unmount()
    useStage.setState({ discussion: state({ available: false }) })
    render(<CallPanel isAnimator members={members} />)
    expect(screen.getByRole('status')).toHaveTextContent('Group calls are not available here.')
    // The chat switch stays: chat and hands keep working without calls (US1 #7).
    expect(screen.getAllByRole('switch').map((s) => s.textContent)).toEqual(['Chat'])
  })

  it('in the call: the people with their state in words, Leave, and Tap to hear when the sound is held back', async () => {
    const leave = vi.fn(() => Promise.resolve())
    const startAudio = vi.fn(() => Promise.resolve())
    useStage.setState({
      discussion: state({ on: true }),
      connection: 'connected',
      audioBlocked: true,
      participants: [person('theo', { local: true, mic: true }), person('nadia', { speaking: true, mic: true, camera: true }), person('amina')],
      leave,
      startAudio,
    })
    render(<CallPanel isAnimator={false} members={members} />)
    expect(screen.getByText('You are in the call.')).toBeInTheDocument()
    expect(screen.getByText('3 people in the call')).toBeInTheDocument()
    const rows = within(screen.getByRole('region', { name: 'In the call' })).getAllByRole('listitem')
    expect(rows[1]).toHaveTextContent('Nadiaspeaking · camera on')
    expect(rows[2]).toHaveTextContent('Aminamicrophone off')
    expect(rows[0]).toHaveTextContent('Théo (you)')
    await userEvent.click(screen.getByRole('button', { name: 'Tap to hear the call' }))
    expect(startAudio).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(leave).toHaveBeenCalled()
  })

  it('keeps the focus when Join call and Leave go: on the bar after joining, on Join call after leaving (T914)', async () => {
    const join = vi.fn(async () => {
      useStage.setState({ connection: 'connected', participants: [person('amina', { local: true })], myPermissions: { canSpeak: false, canVideo: true } })
    })
    const leave = vi.fn(async () => {
      useStage.setState({ connection: 'idle', participants: [], myPermissions: null })
    })
    useStage.setState({ discussion: state({ on: true }), join, leave })
    useRoom.setState({ me: { id: 'amina', role: 'participant' } as never, members })
    const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))
    const { container } = render(
      <>
        <CallPanel isAnimator={false} members={members} />
        <CallControls members={members} view="call" />
      </>,
    )
    screen.getByRole('button', { name: /Join call/ }).focus()
    await userEvent.keyboard('{Enter}')
    // Hand to speak without the floor: Raise hand is the bar's first control.
    expect(container.querySelector('.call-bar__devices .hand-btn')).toHaveFocus()

    ;(container.querySelector('.call-bar__leave') as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    await frame()
    expect(screen.getByRole('button', { name: /Join call/ })).toHaveFocus()

    // Leave from the Call tab: Join call takes its place under the focus.
    await userEvent.keyboard('{Enter}')
    ;(container.querySelector('.call__leave') as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    await frame()
    expect(screen.getByRole('button', { name: /Join call/ })).toHaveFocus()
    useRoom.setState({ me: null, members: [] })
  })

  it('says why joining failed and offers Join again', async () => {
    const join = vi.fn(() => Promise.resolve())
    useStage.setState({ discussion: state({ on: true }), connection: 'failed', error: 'lost', join })
    render(<CallPanel isAnimator={false} members={members} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The connection to the call was lost.')
    await userEvent.click(screen.getByRole('button', { name: 'Join again' }))
    expect(join).toHaveBeenCalled()
  })
})
