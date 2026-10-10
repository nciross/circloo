import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { DiscussionState, HandsView } from '../../../api/circles'
import { useRoom } from '../room'
import { NO_HANDS } from '../room/hands'
import { PersonMenu } from './PersonMenu'
import { configureStage, resetStage, useStage } from './stage'

const state = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: true, videoAllowed: true, speaking: 'hand', available: true, away: 'none', awayEndsAt: null, ...over })
const hands = (over: Partial<HandsView> = {}): HandsView => ({ queue: [], floor: null, ...over })
const raised = (memberId: string) => ({ memberId, raisedAt: '2026-10-09T10:00:00Z' })

/** The real store, its hub replaced: what the actions sent, and the moderation the store keeps from them. */
function hub(fail?: string) {
  const sent: [string, ...unknown[]][] = []
  configureStage({
    circleId: 'c1',
    deps: {
      invoke: (method, ...args) => {
        sent.push([method, ...args])
        return fail ? Promise.reject(new Error(`HubException: ${fail}`)) : Promise.resolve()
      },
    },
  })
  return { sent }
}

const trigger = () => screen.getByRole('button', { name: 'Options for Amina' })
const items = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent)

afterEach(() => {
  resetStage()
  useRoom.setState({ hands: NO_HANDS })
})

describe('PersonMenu', () => {
  it('is a menu button: closed, then opened on the first item, arrows move, Escape gives the focus back', async () => {
    useStage.setState({ discussion: state() })
    useRoom.setState({ hands: hands() })
    render(<PersonMenu memberId="amina" name="Amina" />)
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    trigger().focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Options for Amina' })).toBeInTheDocument()
    expect(document.activeElement).toHaveTextContent('Switch microphone off')
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toHaveTextContent('Switch camera off')
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toHaveTextContent('Remove from call…')
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toHaveTextContent('Switch microphone off')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger())
    await userEvent.keyboard('{ArrowUp}')
    expect(document.activeElement).toHaveTextContent('Remove from call…')
    await userEvent.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('offers the floor only to a raised hand, and takes it back from the floor holder', async () => {
    useStage.setState({ discussion: state() })
    useRoom.setState({ hands: hands() })
    const { rerender } = render(<PersonMenu memberId="amina" name="Amina" />)
    await userEvent.click(trigger())
    expect(items()).not.toContain('Give the floor')
    await userEvent.click(trigger())
    useRoom.setState({ hands: hands({ queue: [raised('amina')] }) })
    rerender(<PersonMenu memberId="amina" name="Amina" />)
    const h = hub()
    await userEvent.click(trigger())
    expect(items()[0]).toBe('Give the floor')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Give the floor' }))
    expect(h.sent).toEqual([['GiveFloor', 'amina']])
    expect(screen.getByText('Amina has the floor.')).toBeInTheDocument()
    expect(document.activeElement).toBe(trigger())
    useRoom.setState({ hands: hands({ floor: 'amina' }) })
    rerender(<PersonMenu memberId="amina" name="Amina" />)
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Take the floor back' }))
    expect(h.sent.at(-1)).toEqual(['LowerHand', 'amina'])
  })

  it('mutes and allows the microphone and the camera, and the menu follows what it did', async () => {
    useStage.setState({ discussion: state() })
    useRoom.setState({ hands: hands() })
    const h = hub()
    render(<PersonMenu memberId="amina" name="Amina" />)
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Switch microphone off' }))
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Switch camera off' }))
    expect(useStage.getState().moderation).toMatchObject({ microphone: ['amina'], camera: ['amina'] })
    await userEvent.click(trigger())
    expect(items()).toEqual(['Allow microphone', 'Allow camera', 'Remove from call…'])
    await userEvent.click(screen.getByRole('menuitem', { name: 'Allow microphone' }))
    expect(h.sent).toEqual([['MuteMember', 'amina', 'microphone'], ['MuteMember', 'amina', 'camera'], ['AllowMember', 'amina', 'microphone']])
    expect(useStage.getState().moderation.microphone).toEqual([])
  })

  it('has no camera items in an audio call', async () => {
    useStage.setState({ discussion: state({ videoAllowed: false }) })
    useRoom.setState({ hands: hands() })
    render(<PersonMenu memberId="amina" name="Amina" />)
    await userEvent.click(trigger())
    expect(items()).toEqual(['Switch microphone off', 'Remove from call…'])
  })

  it('asks once more before removing, in place, with Cancel focused', async () => {
    useStage.setState({ discussion: state() })
    useRoom.setState({ hands: hands() })
    const h = hub()
    render(<PersonMenu memberId="amina" name="Amina" />)
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from call…' }))
    const ask = screen.getByRole('group', { name: /Remove Amina from this call\?/ })
    expect(document.activeElement).toBe(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(h.sent).toEqual([])
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group')).toBeNull()
    expect(document.activeElement).toBe(trigger())
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from call…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(h.sent).toEqual([['RemoveFromCall', 'amina']])
    expect(useStage.getState().moderation.removed).toEqual(['amina'])
    expect(screen.getByText('Amina is out of this call.')).toBeInTheDocument()
  })

  it('shows a refusal in the menu, translated, and keeps the state as it was', async () => {
    useStage.setState({ discussion: state() })
    useRoom.setState({ hands: hands() })
    hub('try-again')
    render(<PersonMenu memberId="amina" name="Amina" />)
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Switch microphone off' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The call server did not answer. Try again.')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(useStage.getState().moderation.microphone).toEqual([])
  })

  it('closes on a press outside', async () => {
    useStage.setState({ discussion: state() })
    useRoom.setState({ hands: hands() })
    render(<><PersonMenu memberId="amina" name="Amina" /><p>Elsewhere</p></>)
    await userEvent.click(trigger())
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Elsewhere'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('is drawn over the page, outside the tile that holds the trigger', async () => {
    useStage.setState({ discussion: state() })
    useRoom.setState({ hands: hands() })
    render(<ul><li data-testid="tile"><PersonMenu memberId="amina" name="Amina" /></li></ul>)
    await userEvent.click(trigger())
    expect(screen.getByTestId('tile')).not.toContainElement(screen.getByRole('menu'))
    expect(screen.getByRole('menu').parentElement?.parentElement).toBe(document.body)
  })
})
