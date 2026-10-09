import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { Member } from '../../../api/circles'
import type { CallParticipant, CallVideo } from './call'
import { CallStage } from './CallStage'
import { resetStage, useStage } from './stage'

const names = ['Nadia', 'Amina', 'Théo', 'Lucía', 'Youssef', 'Inès', 'Malik', 'Sofía', 'Hugo', 'Leïla', 'Omar', 'Camille']
const members: Member[] = names.map((name, i) => ({ id: `m${i}`, role: i === 0 ? 'animator' : 'participant', name, character: 'fox', ring: 0 }) as Member)
const video = (): CallVideo => ({ attach: vi.fn(), detach: vi.fn(), setEnabled: vi.fn() })
const person = (i: number, over: Partial<CallParticipant> = {}): CallParticipant => ({
  id: `m${i}`, name: names[i]!, local: false, speaking: false, quality: 'good', mic: true, camera: false, video: null, ...over,
})

/** Me (Camille, the last name) plus everyone else, in join order. */
function inCall(over: Record<number, Partial<CallParticipant>> = {}, n = names.length) {
  const participants = [person(n - 1, { local: true, ...over[n - 1] }), ...Array.from({ length: n - 1 }, (_, i) => person(i, over[i]))]
  useStage.setState({ connection: 'connected', participants, roster: participants.map((p) => p.id) })
  return participants
}

function phone(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: on, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
}

const tiles = () => within(screen.getByRole('list', { name: /People on screen/ })).getAllByRole('listitem')

beforeEach(() => phone(false))
afterEach(() => {
  resetStage()
  vi.unstubAllGlobals()
})

describe('CallStage', () => {
  it('shows 9 tiles a page on a computer, your preview last, and pages by keyboard', async () => {
    inCall()
    render(<CallStage members={members} floor={null} />)
    expect(tiles()).toHaveLength(9)
    expect(tiles()[0]).toHaveTextContent('Nadia')
    expect(tiles().at(-1)).toHaveTextContent('Camille (you)')
    const pages = screen.getByRole('navigation', { name: 'Pages of the call' })
    expect(pages).toHaveTextContent('Page 1 of 2')
    expect(within(pages).getByRole('button', { name: 'Previous page' })).toHaveAttribute('aria-disabled', 'true')
    within(pages).getByRole('button', { name: 'Next page' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(pages).toHaveTextContent('Page 2 of 2')
    expect(screen.getByRole('list', { name: 'People on screen, page 2 of 2' })).toBeInTheDocument()
    expect(tiles().map((li) => li.textContent)).toEqual(['Hugo', 'Leïla', 'Omar', 'Camille (you)'])
  })

  it('shows 4 tiles a page on a phone', () => {
    phone(true)
    inCall()
    render(<CallStage members={members} floor={null} />)
    expect(tiles()).toHaveLength(4)
    expect(screen.getByRole('navigation', { name: 'Pages of the call' })).toHaveTextContent('Page 1 of 4')
  })

  it('outlines the speaker with the word Speaking and keeps them on every page', async () => {
    phone(true)
    inCall({ 9: { speaking: true } })
    render(<CallStage members={members} floor={null} />)
    expect(tiles()[0]).toHaveTextContent('Leïla')
    expect(tiles()[0]).toHaveClass('is-speaking')
    expect(within(tiles()[0]!).getByText('Speaking')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(tiles()[0]).toHaveTextContent('Leïla')
    // Only the speaker carries the word.
    expect(screen.getAllByText('Speaking')).toHaveLength(1)
  })

  it('draws the character and the name when the camera is off, never an empty box', () => {
    inCall({ 1: { mic: false } }, 3)
    const { container } = render(<CallStage members={members} floor={null} />)
    expect(container.querySelector('video')).toBeNull()
    const amina = tiles().find((li) => li.textContent?.startsWith('Amina'))!
    expect(amina.querySelector('.call-tile__char')).not.toBeNull()
    expect(amina).toHaveTextContent('Amina, microphone off')
  })

  it('attaches the videos on the page and switches the others off at the call server', async () => {
    phone(true)
    const videos = names.map(() => video())
    inCall(Object.fromEntries(names.map((_, i) => [i, { camera: true, video: videos[i] }])))
    const { container, unmount } = render(<CallStage members={members} floor={null} />)
    expect(container.querySelectorAll('video')).toHaveLength(4)
    expect(videos[0]!.attach).toHaveBeenCalled()
    expect(videos[0]!.setEnabled).toHaveBeenLastCalledWith(true)
    expect(videos[5]!.setEnabled).toHaveBeenLastCalledWith(false)
    // Your own preview is never switched off.
    expect(videos[11]!.setEnabled).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(videos[0]!.setEnabled).toHaveBeenLastCalledWith(false)
    expect(videos[0]!.detach).toHaveBeenCalled()
    expect(videos[3]!.setEnabled).toHaveBeenLastCalledWith(true)
    unmount()
    expect(videos[3]!.setEnabled).toHaveBeenLastCalledWith(false)
  })

  it('makes the speaker large in speaker view', async () => {
    inCall({ 2: { speaking: true } }, 4)
    render(<CallStage members={members} floor="m1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Speaker' }))
    expect(tiles()[0]).toHaveClass('is-big')
    expect(tiles()[0]).toHaveTextContent('Théo')
    expect(screen.getByText('Has the floor')).toBeInTheDocument()
  })

  it('says it is joining, then that you are alone, with your weak connection on your tile', () => {
    useStage.setState({ connection: 'joining' })
    const { rerender } = render(<CallStage members={members} floor={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Joining the call…')
    act(() => useStage.setState({ connection: 'connected', participants: [person(0, { local: true, quality: 'poor' })], roster: ['m0'] }))
    rerender(<CallStage members={members} floor={null} />)
    expect(screen.getByText('You are the only one here for now. People appear as they join.')).toBeInTheDocument()
    expect(tiles()[0]).toHaveTextContent('Weak connection')
  })
})
