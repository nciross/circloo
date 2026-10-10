import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { DiscussionState, Member } from '../../../api/circles'
import type { CallParticipant } from './call'
import { CallControls } from './CallControls'
import { JOINS_WINDOW } from './joins'
import { resetPrimer } from './primer'
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

/** What the browser says it will do when a device is asked for. */
function permission(state: PermissionState) {
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: () => Promise.resolve({ state }) } })
}
const SENTENCE = "Your camera and microphone go to the people in this call through circloo's call server. Nothing is recorded or kept."

function connected(over: Partial<ReturnType<typeof useStage.getState>> = {}) {
  useStage.setState({ discussion: state(), connection: 'connected', myPermissions: { canSpeak: true, canVideo: true }, participants: [me, person('nadia')], ...over })
}

afterEach(() => {
  resetStage()
  resetPrimer()
  delete (navigator as { permissions?: unknown }).permissions
  vi.useRealTimers()
})

describe('CallControls', () => {
  it('shows the animator-away countdown in the bar, said once', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] })
    vi.setSystemTime(Date.parse('2026-10-09T10:00:00Z'))
    connected({ discussion: state({ away: 'away', awayEndsAt: '2026-10-09T10:04:30Z' }) })
    render(<CallControls members={members} view="call" />)
    expect(screen.getByText('The animator is away.')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('timer')).toHaveTextContent('4:30')
  })

  it('shows nothing outside a call', () => {
    const { container } = render(<CallControls members={members} view="round" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('switches the microphone and the camera as toggle buttons, and leaves', async () => {
    const setMic = vi.fn(() => Promise.resolve())
    const setCamera = vi.fn(() => Promise.resolve())
    const leave = vi.fn(() => Promise.resolve())
    permission('granted')
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

  it('says why a browser cannot join, without Join again', () => {
    useStage.setState({ discussion: state(), connection: 'failed', error: 'unsupported' })
    render(<CallControls members={members} view="round" />)
    expect(screen.getByRole('alert')).toHaveTextContent('This browser cannot join the call. You can still chat and raise your hand.')
    expect(screen.queryByRole('button', { name: 'Join again' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
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

describe('CallControls: devices (T907)', () => {
  it('explains before the browser asks, and asks only after Continue', async () => {
    permission('prompt')
    const setMic = vi.fn(() => Promise.resolve())
    connected({ setMic })
    render(<CallControls members={members} view="call" />)
    const mic = screen.getByRole('button', { name: 'Microphone' })
    await userEvent.click(mic)
    const primer = await screen.findByRole('group', { name: 'Microphone' })
    expect(primer).toHaveTextContent(SENTENCE)
    expect(setMic).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(setMic).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('group', { name: 'Microphone' })).toBeNull()
    expect(mic).toHaveFocus()
  })

  it('shows the primer once per device kind in the session', async () => {
    permission('prompt')
    const setMic = vi.fn(() => Promise.resolve())
    const setCamera = vi.fn(() => Promise.resolve())
    connected({ setMic, setCamera })
    render(<CallControls members={members} view="call" />)
    await userEvent.click(screen.getByRole('button', { name: 'Microphone' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    // Off, then on again: no second primer for the microphone.
    act(() => useStage.setState({ me: { mic: true, camera: false } }))
    await userEvent.click(screen.getByRole('button', { name: 'Microphone' }))
    expect(setMic).toHaveBeenLastCalledWith(false)
    act(() => useStage.setState({ me: { mic: false, camera: false } }))
    await userEvent.click(screen.getByRole('button', { name: 'Microphone' }))
    expect(setMic).toHaveBeenLastCalledWith(true)
    expect(screen.queryByRole('group', { name: 'Microphone' })).toBeNull()
    // The camera is another question from the browser: its own primer.
    await userEvent.click(screen.getByRole('button', { name: 'Camera' }))
    expect(await screen.findByRole('group', { name: 'Camera' })).toHaveTextContent(SENTENCE)
    expect(setCamera).not.toHaveBeenCalled()
  })

  it('Not now and Escape ask nothing and put the focus back on the device', async () => {
    permission('prompt')
    const setCamera = vi.fn(() => Promise.resolve())
    connected({ setCamera })
    render(<CallControls members={members} view="call" />)
    const camera = screen.getByRole('button', { name: 'Camera' })
    await userEvent.click(camera)
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(camera).toHaveFocus()
    await userEvent.click(camera)
    await screen.findByRole('group', { name: 'Camera' })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Camera' })).toBeNull()
    expect(camera).toHaveFocus()
    expect(setCamera).not.toHaveBeenCalled()
  })

  it('needs no primer when the browser will not ask', async () => {
    permission('denied')
    const setMic = vi.fn(() => Promise.resolve())
    connected({ setMic })
    render(<CallControls members={members} view="call" />)
    await userEvent.click(screen.getByRole('button', { name: 'Microphone' }))
    expect(setMic).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('takes the primer away with the floor', async () => {
    permission('prompt')
    connected()
    render(<CallControls members={members} view="call" />)
    await userEvent.click(screen.getByRole('button', { name: 'Microphone' }))
    await screen.findByRole('group', { name: 'Microphone' })
    act(() => useStage.setState({ myPermissions: { canSpeak: false, canVideo: true } }))
    expect(screen.queryByRole('group', { name: 'Microphone' })).toBeNull()
  })

  it.each([
    ['denied', 'Your browser is blocking the microphone.'],
    ['no-device', 'No microphone found. You can still listen, chat and raise your hand.'],
    ['busy', 'Another app is using your microphone. Close it, then try again.'],
    ['blocked', 'blocks the microphone here. You can still listen, chat and raise your hand.'],
    ['unsupported', 'This browser cannot use a microphone on this page.'],
  ] as const)('%s: said in the status area of the bar, never in the notice line', (problem, text) => {
    connected({ deviceProblem: { id: 1, kind: 'audio', problem } })
    const { container } = render(<CallControls members={members} view="call" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(text)
    expect(container.querySelector('.call-bar__state')).toContainElement(alert)
    // The rest of the bar keeps working.
    expect(screen.getByRole('button', { name: 'Leave' })).toBeEnabled()
  })

  it('stays until dismissed, then the focus goes back to the device', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    connected({ deviceProblem: { id: 1, kind: 'video', problem: 'no-device' } })
    render(<CallControls members={members} view="call" />)
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('alert')).toHaveTextContent('No camera found.')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(useStage.getState().deviceProblem).toBeNull()
    expect(screen.getByRole('button', { name: 'Camera' })).toHaveFocus()
  })

  it('Try again asks for the device again, without a second primer', async () => {
    permission('prompt')
    const setMic = vi.fn(() => {
      useStage.setState({ deviceProblem: null })
      return Promise.resolve()
    })
    connected({ setMic })
    render(<CallControls members={members} view="call" />)
    await userEvent.click(screen.getByRole('button', { name: 'Microphone' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    act(() => useStage.setState({ deviceProblem: { id: 2, kind: 'audio', problem: 'busy' } }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(setMic).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('group')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Microphone' })).toHaveFocus()
  })

  it('a camera problem goes when video is switched off for the call', () => {
    connected({ deviceProblem: { id: 1, kind: 'video', problem: 'denied' } })
    render(<CallControls members={members} view="call" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    act(() => useStage.setState({ discussion: state({ videoAllowed: false }) }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
