import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { DiscussionState, Member } from '../../../api/circles'
import type { CallParticipant } from './call'
import { CallPanel } from './CallPanel'
import { resetStage, useStage } from './stage'

const state = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: false, videoAllowed: true, speaking: 'hand', available: true, away: 'none', awayEndsAt: null, ...over })
const members: Member[] = [
  { id: 'nadia', role: 'animator', name: 'Nadia', character: 'panda', ring: 0 },
  { id: 'amina', role: 'participant', name: 'Amina', character: 'fox', ring: 0 },
  { id: 'theo', role: 'participant', name: 'Théo', character: 'frog', ring: 0 },
] as Member[]
const person = (id: string, over: Partial<CallParticipant> = {}): CallParticipant => ({
  id, name: id, local: false, speaking: false, quality: 'good', mic: false, camera: false, video: null, ...over,
})

afterEach(() => resetStage())

describe('CallPanel', () => {
  it('gives the animator the switch, off by default, and sends the camera choice with it', async () => {
    const enable = vi.fn(() => Promise.resolve())
    useStage.setState({ discussion: state(), enableDiscussion: enable })
    render(<CallPanel isAnimator />)
    const toggle = screen.getByRole('switch', { name: 'Live discussion' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toHaveAccessibleDescription(/off by default/)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Allow cameras' }))
    await userEvent.click(toggle)
    expect(enable).toHaveBeenCalledWith(false)
    expect(screen.queryByText('Soon')).toBeNull()
  })

  it('switches it off, and says so when the hub refuses', async () => {
    const disable = vi.fn(() => Promise.reject(new Error('HubException: animator-only')))
    useStage.setState({ discussion: state({ on: true }), disableDiscussion: disable })
    render(<CallPanel isAnimator />)
    await userEvent.click(screen.getByRole('switch', { name: 'Live discussion' }))
    expect(disable).toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the animator can change this.')
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
    render(<CallPanel isAnimator={false} members={members} hands={{ queue: [], floor: 'amina' }} />)
    expect(screen.getByRole('status')).toHaveTextContent('A video call is on.')
    expect(screen.getByText('2 people in the call')).toBeInTheDocument()
    const list = screen.getByRole('region', { name: 'In the call' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Nadia', 'Aminahas the floor'])
    await userEvent.click(screen.getByRole('button', { name: 'Join call' }))
    expect(join).toHaveBeenCalled()
  })

  it('says an audio call is on, and that calls are not available here without a call server', () => {
    useStage.setState({ discussion: state({ on: true, videoAllowed: false }) })
    const { unmount } = render(<CallPanel isAnimator={false} members={members} />)
    expect(screen.getByRole('status')).toHaveTextContent('An audio call is on.')
    unmount()
    useStage.setState({ discussion: state({ available: false }) })
    render(<CallPanel isAnimator members={members} />)
    expect(screen.getByRole('status')).toHaveTextContent('Group calls are not available here.')
    expect(screen.queryByRole('switch')).toBeNull()
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

  it('says why joining failed and offers Join again', async () => {
    const join = vi.fn(() => Promise.resolve())
    useStage.setState({ discussion: state({ on: true }), connection: 'failed', error: 'lost', join })
    render(<CallPanel isAnimator={false} members={members} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The connection to the call was lost.')
    await userEvent.click(screen.getByRole('button', { name: 'Join again' }))
    expect(join).toHaveBeenCalled()
  })
})
