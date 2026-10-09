import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { DiscussionState, Member } from '../../../api/circles'
import type { CallParticipant } from './call'
import { CallControls } from './CallControls'
import { JOINS_WINDOW } from './joins'
import { resetStage, useStage } from './stage'

const state = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: true, videoAllowed: true, speaking: 'hand', available: true, away: 'none', awayEndsAt: null, ...over })
const members: Member[] = [
  { id: 'nadia', role: 'animator', name: 'Nadia', character: 'panda', ring: 0 },
  { id: 'amina', role: 'participant', name: 'Amina', character: 'fox', ring: 0 },
  { id: 'theo', role: 'participant', name: 'Théo', character: 'frog', ring: 0 },
] as Member[]
const person = (id: string, over: Partial<CallParticipant> = {}): CallParticipant => ({
  id, name: id, local: false, speaking: false, quality: 'good', mic: false, camera: false, video: null, ...over,
})
const me = person('amina', { local: true })

function connected(over: Partial<ReturnType<typeof useStage.getState>> = {}) {
  useStage.setState({ discussion: state(), connection: 'connected', myPermissions: { canSpeak: true, canVideo: true }, participants: [me, person('nadia')], ...over })
}

afterEach(() => {
  resetStage()
  vi.useRealTimers()
})

describe('CallControls', () => {
  it('shows nothing outside a call', () => {
    const { container } = render(<CallControls members={members} view="round" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('switches the microphone and the camera as toggle buttons, and leaves', async () => {
    const setMic = vi.fn(() => Promise.resolve())
    const setCamera = vi.fn(() => Promise.resolve())
    const leave = vi.fn(() => Promise.resolve())
    connected({ setMic, setCamera, leave })
    render(<CallControls members={members} view="call" />)
    const mic = screen.getByRole('button', { name: 'Microphone' })
    expect(mic).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(mic)
    expect(setMic).toHaveBeenCalledWith(true)
    await userEvent.click(screen.getByRole('button', { name: 'Camera' }))
    expect(setCamera).toHaveBeenCalledWith(true)
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(leave).toHaveBeenCalled()
  })

  it('keeps a microphone the call server does not allow off, and says why', async () => {
    const setMic = vi.fn(() => Promise.resolve())
    connected({ setMic, myPermissions: { canSpeak: false, canVideo: true } })
    render(<CallControls members={members} view="call" />)
    const mic = screen.getByRole('button', { name: 'Microphone' })
    expect(mic).toHaveAttribute('aria-disabled', 'true')
    expect(mic).toHaveAccessibleDescription('Your microphone stays off until the animator lets you speak.')
    await userEvent.click(mic)
    expect(setMic).not.toHaveBeenCalled()
  })

  it('has no camera button in an audio call', () => {
    connected({ discussion: state({ videoAllowed: false }) })
    render(<CallControls members={members} view="call" />)
    expect(screen.queryByRole('button', { name: 'Camera' })).toBeNull()
  })

  it('offers Tap to hear the call when the browser held the sound back', async () => {
    const startAudio = vi.fn(() => Promise.resolve())
    connected({ audioBlocked: true, startAudio })
    render(<CallControls members={members} view="call" />)
    await userEvent.click(screen.getByRole('button', { name: 'Tap to hear the call' }))
    expect(startAudio).toHaveBeenCalled()
  })

  it('says Reconnecting and Weak connection in words', () => {
    connected({ connection: 'reconnecting' })
    const { unmount } = render(<CallControls members={members} view="call" />)
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…')
    unmount()
    connected({ participants: [{ ...me, quality: 'poor' }] })
    render(<CallControls members={members} view="call" />)
    expect(screen.getByRole('status')).toHaveTextContent('Weak connection')
  })

  it('says why the call failed and offers Join again', async () => {
    const join = vi.fn(() => Promise.resolve())
    const leave = vi.fn(() => Promise.resolve())
    useStage.setState({ discussion: state(), connection: 'failed', error: 'unreachable', join, leave })
    render(<CallControls members={members} view="round" />)
    expect(screen.getByRole('alert')).toHaveTextContent('You can’t join the call from this network.')
    await userEvent.click(screen.getByRole('button', { name: 'Join again' }))
    expect(join).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(leave).toHaveBeenCalled()
  })

  it('switches the centre between the call and the round', async () => {
    connected()
    const onView = vi.fn()
    render(<CallControls members={members} view="call" onView={onView} roundLabel="Whiteboard" />)
    expect(screen.getByRole('button', { name: 'Call' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Whiteboard' }))
    expect(onView).toHaveBeenCalledWith('round')
  })

  it('announces joins and leaves politely, grouped', () => {
    vi.useFakeTimers()
    connected()
    render(<CallControls members={members} view="call" />)
    const region = document.querySelector('[aria-live="polite"]')!
    expect(region).toHaveTextContent('')
    act(() => useStage.setState({ participants: [me, person('theo')] }))
    act(() => vi.advanceTimersByTime(JOINS_WINDOW))
    expect(region).toHaveTextContent('Théo joined the call. Nadia left the call.')
  })
})
