import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { DiscussionState, RoomSettings } from '../../../api/circles'
import { useRoom } from '../room'
import { DiscussionSwitch } from './DiscussionSwitch'
import { resetStage, useStage } from './stage'

const state = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: false, videoAllowed: true, speaking: 'hand', available: true, away: 'none', awayEndsAt: null, ...over })
const settings = (over: Partial<RoomSettings> = {}): RoomSettings => ({ chat: 'open', reactions: true, pirikooQuiet: false, ...over })
const ok = () => vi.fn((..._args: unknown[]) => Promise.resolve())
const toggle = (name: string) => screen.getByRole('switch', { name })

const original = useRoom.getState()
beforeEach(() => useRoom.setState({ settings: settings() }))
afterEach(() => {
  resetStage()
  useRoom.setState({ settings: original.settings, setRoomSettings: original.setRoomSettings })
})

describe('DiscussionSwitch', () => {
  it('shows three switches: chat on, both calls off, each with its sentence', () => {
    useStage.setState({ discussion: state() })
    render(<DiscussionSwitch />)
    expect(screen.getByRole('heading', { name: 'Room controls' })).toBeInTheDocument()
    expect(screen.getAllByRole('switch').map((s) => s.textContent)).toEqual(['Chat', 'Audio call', 'Video call'])
    expect(toggle('Chat')).toHaveAttribute('aria-checked', 'true')
    expect(toggle('Chat')).toHaveAccessibleDescription(/only you can write/)
    expect(toggle('Audio call')).toHaveAttribute('aria-checked', 'false')
    expect(toggle('Video call')).toHaveAttribute('aria-checked', 'false')
    expect(toggle('Audio call')).toHaveAccessibleDescription(/Nobody is in it until they tap Join call/)
  })

  it('starts an audio call or a video call with the speaking mode picked before', async () => {
    const enable = ok()
    useStage.setState({ discussion: state(), enableDiscussion: enable })
    render(<DiscussionSwitch />)
    const mode = screen.getByRole('group', { name: 'Who can speak' })
    expect(within(mode).getByRole('button', { name: 'Hand to speak' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(mode).getByRole('button', { name: 'Open mic' }))
    expect(within(mode).getByRole('button', { name: 'Open mic' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Anyone in the call can switch their microphone on.')).toBeInTheDocument()
    await userEvent.click(toggle('Audio call'))
    expect(enable).toHaveBeenLastCalledWith(false, 'open')
    await userEvent.click(toggle('Video call'))
    expect(enable).toHaveBeenLastCalledWith(true, 'open')
  })

  it('during an audio call: video on keeps the call, the call switch ends it', async () => {
    const enable = ok()
    const disable = ok()
    useStage.setState({ discussion: state({ on: true, videoAllowed: false }), enableDiscussion: enable, disableDiscussion: disable })
    render(<DiscussionSwitch />)
    expect(toggle('Audio call')).toHaveAttribute('aria-checked', 'true')
    expect(toggle('Video call')).toHaveAttribute('aria-checked', 'false')
    expect(toggle('Audio call')).toHaveAccessibleDescription('Switching it off ends the call for everyone.')
    expect(toggle('Video call')).toHaveAccessibleDescription(/No camera turns on by itself/)
    await userEvent.click(toggle('Video call'))
    expect(enable).toHaveBeenCalledWith(true, 'hand')
    await userEvent.click(toggle('Audio call'))
    expect(disable).toHaveBeenCalled()
  })

  it('during a video call: switching video off goes back to voices only', async () => {
    const enable = ok()
    useStage.setState({ discussion: state({ on: true, videoAllowed: true, speaking: 'open' }), enableDiscussion: enable })
    render(<DiscussionSwitch />)
    expect(toggle('Video call')).toHaveAttribute('aria-checked', 'true')
    expect(toggle('Audio call')).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(toggle('Video call'))
    expect(enable).toHaveBeenCalledWith(false, 'open')
  })

  it('changes the mode during the call through the hub, and offers Mute everyone in Open mic only', async () => {
    const setMode = ok()
    const muteAll = ok()
    useStage.setState({ discussion: state({ on: true }), setSpeakingMode: setMode, muteEveryone: muteAll })
    const { rerender } = render(<DiscussionSwitch />)
    expect(screen.queryByRole('button', { name: 'Mute everyone' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Open mic' }))
    expect(setMode).toHaveBeenCalledWith('open')
    // The server's answer (Discussion) is what changes the picked mode.
    expect(screen.getByRole('button', { name: 'Hand to speak' })).toHaveAttribute('aria-pressed', 'true')
    useStage.setState({ discussion: state({ on: true, speaking: 'open' }) })
    rerender(<DiscussionSwitch />)
    const mute = screen.getByRole('button', { name: 'Mute everyone' })
    expect(mute).toHaveAccessibleDescription(/People can switch theirs on again/)
    await userEvent.click(mute)
    expect(muteAll).toHaveBeenCalled()
    expect(screen.getByText('Every microphone is off.')).toBeInTheDocument()
  })

  it('switches the chat off and on through the room settings, keeping the other settings', async () => {
    const setRoomSettings = ok()
    useRoom.setState({ settings: settings({ reactions: false }), setRoomSettings })
    useStage.setState({ discussion: state() })
    const { rerender } = render(<DiscussionSwitch />)
    await userEvent.click(toggle('Chat'))
    expect(setRoomSettings).toHaveBeenCalledWith({ chat: 'paused', reactions: false, pirikooQuiet: false })
    useRoom.setState({ settings: settings({ chat: 'paused', reactions: false }) })
    rerender(<DiscussionSwitch />)
    expect(toggle('Chat')).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(toggle('Chat'))
    expect(setRoomSettings).toHaveBeenLastCalledWith({ chat: 'open', reactions: false, pirikooQuiet: false })
  })

  it('keeps only the chat switch when calls are not available here', () => {
    useStage.setState({ discussion: state({ available: false }) })
    render(<DiscussionSwitch />)
    expect(screen.getAllByRole('switch').map((s) => s.textContent)).toEqual(['Chat'])
    expect(screen.queryByRole('group', { name: 'Who can speak' })).toBeNull()
  })

  it('translates refusals, including try-again', async () => {
    useStage.setState({ discussion: state(), enableDiscussion: vi.fn(() => Promise.reject(new Error('HubException: try-again'))) })
    render(<DiscussionSwitch />)
    await userEvent.click(toggle('Video call'))
    expect(await screen.findByRole('alert')).toHaveTextContent('The call server did not answer. Try again.')
  })

  it('ignores a second press while the first one runs', async () => {
    let finish = () => {}
    const enable = vi.fn(() => new Promise<void>((r) => (finish = r)))
    useStage.setState({ discussion: state(), enableDiscussion: enable })
    render(<DiscussionSwitch />)
    await userEvent.click(toggle('Audio call'))
    expect(toggle('Audio call')).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(toggle('Video call'))
    expect(enable).toHaveBeenCalledTimes(1)
    finish()
  })
})
