import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { DiscussionState } from '../../../api/circles'
import { CallPanel } from './CallPanel'
import { resetStage, useStage } from './stage'

const state = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: false, videoAllowed: true, stageMax: 8, listenersMax: 8, away: 'none', awayEndsAt: null, ...over })

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
    expect(screen.getByText('Soon')).toBeInTheDocument()
  })

  it('switches it off, and says so when the hub refuses', async () => {
    const disable = vi.fn(() => Promise.reject(new Error('HubException: animator-only')))
    useStage.setState({ discussion: state({ on: true }), disableDiscussion: disable })
    render(<CallPanel isAnimator />)
    await userEvent.click(screen.getByRole('switch', { name: 'Live discussion' }))
    expect(disable).toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the animator can change this.')
  })

  it('shows participants the state and the stage to come, without controls', () => {
    useStage.setState({ discussion: state({ on: true }) })
    render(<CallPanel isAnimator={false} />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Live discussion is on.')
    expect(screen.getByText('Audio and video arrive next. Chat and raise your hand meanwhile.')).toBeInTheDocument()
  })
})
