import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../../i18n'
import type { HandsView, Member } from '../../../api/circles'
import { useRoom } from '../room'
import { HandsQueue } from './HandsQueue'
import { HandButton } from './HandButton'
import { CallAnnouncer } from '../stage/CallAnnouncer'
import { PeopleList } from './PeopleList'
import { NO_HANDS } from './hands'

const nadia: Member = { id: 'n', name: 'Nadia', role: 'animator', character: 'panda', ring: 0 }
const amina: Member = { id: 'a', name: 'Amina', role: 'participant', character: 'robot', ring: 0 }
const kenji: Member = { id: 'k', name: 'Kenji', role: 'participant', character: 'fox', ring: 0 }
const lucia: Member = { id: 'l', name: 'Lucía', role: 'participant', character: 'fox', ring: 1 }
const members = [nadia, amina, kenji, lucia]

const NOW = Date.parse('2026-10-09T10:05:00Z')
const raised = (ids: string[], floor: string | null = null): HandsView => ({
  queue: ids.map((memberId, i) => ({ memberId, raisedAt: new Date(NOW - (3 - i) * 60_000).toISOString() })),
  floor,
})

const hub = {
  raiseHand: vi.fn<() => Promise<void>>(),
  lowerHand: vi.fn<(memberId?: string) => Promise<void>>(),
  lowerAllHands: vi.fn<() => Promise<void>>(),
  giveFloor: vi.fn<(memberId: string) => Promise<void>>(),
}
const refuse = (code: string) => Promise.reject(new Error(`An unexpected error occurred invoking 'X' on the server. HubException: ${code}`))

function enter(me: Member, hands: HandsView = NO_HANDS) {
  useRoom.setState({ me, members, hands, ...hub })
}

beforeEach(async () => {
  for (const f of Object.values(hub)) f.mockReset().mockResolvedValue(undefined)
  await i18n.changeLanguage('en')
})
afterEach(() => vi.useRealTimers())

describe('HandsQueue for a participant', () => {
  it('raises the hand in one tap, then shows the place and lowers it', async () => {
    enter(kenji)
    const { rerender } = render(<HandsQueue />)
    expect(screen.getByText('No hands up')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Raise hand' }))
    expect(hub.raiseHand).toHaveBeenCalledOnce()

    act(() => useRoom.setState({ hands: raised(['a', 'k']) }))
    rerender(<HandsQueue />)
    expect(screen.getByText('You are 2nd')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Lower hand' }))
    expect(hub.lowerHand).toHaveBeenCalledWith()
  })

  it('shows everyone the whole line in order with names, and who speaks and who is next', () => {
    enter(lucia, raised(['k', 'l'], 'a'))
    render(<HandsQueue />)
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('bdi')?.textContent)).toEqual(['Kenji', 'Lucía'])
    expect(rows[1]).toHaveClass('is-me')
    expect(rows[1]!.querySelector('.char--ring-1')).not.toBeNull()
    expect(screen.getByText('2 waiting')).toBeInTheDocument()
    expect(screen.getByText(/is speaking/).closest('p')).toHaveTextContent('Amina is speaking · . Kenji is next')
    // Participants never see the animator's tools.
    expect(screen.queryByRole('button', { name: /Give the floor/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lower all hands' })).toBeNull()
  })

  it('says "I’m done" once given the floor', async () => {
    enter(amina, raised(['k'], 'a'))
    render(<HandsQueue />)
    expect(screen.getByText('You have the floor')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'I’m done' }))
    expect(hub.lowerHand).toHaveBeenCalledWith()
  })

  it('says kindly when the hub asks to slow down', async () => {
    enter(kenji)
    hub.raiseHand.mockImplementation(() => refuse('slow-down'))
    render(<HandsQueue />)
    await userEvent.click(screen.getByRole('button', { name: 'Raise hand' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('wait a few seconds')
  })

  it('reads in Arabic, with the place in words', async () => {
    await i18n.changeLanguage('ar')
    enter(kenji, raised(['a', 'k']))
    render(<HandsQueue />)
    expect(screen.getByText('ترتيبك في الدور: 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إنزال اليد' })).toBeInTheDocument()
  })
})

describe('HandsQueue for the animator', () => {
  it('shows how long each hand has waited and gives the floor, lowers one or all', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    enter(nadia, raised(['a', 'k']))
    render(<HandsQueue />)
    expect(screen.queryByRole('button', { name: 'Raise hand' })).toBeNull()
    expect(screen.getByText('Waiting 3 min')).toBeInTheDocument()
    expect(screen.getByText('Waiting 2 min')).toBeInTheDocument()
    expect(document.querySelector('.hands__now')).toHaveTextContent('Amina is next')

    await userEvent.click(screen.getByRole('button', { name: 'Give the floor to Amina' }))
    expect(hub.giveFloor).toHaveBeenCalledWith('a')
    await userEvent.click(screen.getByRole('button', { name: 'Lower Kenji’s hand' }))
    expect(hub.lowerHand).toHaveBeenCalledWith('k')
    await userEvent.click(screen.getByRole('button', { name: 'Lower all hands' }))
    expect(hub.lowerAllHands).toHaveBeenCalledOnce()
  })

  it('ends the speaker’s turn, and is told when a hand was already down', async () => {
    enter(nadia, raised(['k'], 'a'))
    hub.giveFloor.mockImplementation(() => refuse('hand-invalid'))
    render(<HandsQueue />)
    await userEvent.click(screen.getByRole('button', { name: 'End turn' }))
    expect(hub.lowerHand).toHaveBeenCalledWith('a')
    await userEvent.click(screen.getByRole('button', { name: 'Give the floor to Kenji' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That hand is already down.')
  })

  it('keeps the focus in the queue when the row that had it goes', async () => {
    enter(nadia, raised(['a', 'k']))
    hub.giveFloor.mockImplementation(async () => useRoom.setState({ hands: raised(['k'], 'a') }))
    render(<HandsQueue />)
    await userEvent.click(screen.getByRole('button', { name: 'Give the floor to Amina' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Give the floor to Kenji' })).toHaveFocus())
    hub.lowerHand.mockImplementation(async () => useRoom.setState({ hands: raised([], 'a') }))
    await userEvent.click(screen.getByRole('button', { name: 'Lower Kenji’s hand' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'End turn' })).toHaveFocus())
  })

  it('explains the empty line', () => {
    enter(nadia)
    render(<HandsQueue />)
    expect(screen.getByText(/they line up here/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('HandButton', () => {
  it('is for participants only, and says a refusal under itself when no one else does', async () => {
    enter(nadia)
    const { unmount } = render(<HandButton />)
    expect(screen.queryByRole('button')).toBeNull()
    unmount()
    enter(kenji)
    hub.raiseHand.mockImplementation(() => refuse('offline'))
    render(<HandButton size="sm" />)
    await userEvent.click(screen.getByRole('button', { name: 'Raise hand' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You are offline')
  })
})

describe('CallAnnouncer, the hands of spec 008 without a call', () => {
  it('tells the animator about each hand, grouped when several go up together', () => {
    vi.useFakeTimers()
    enter(nadia, raised(['a']))
    render(<CallAnnouncer />)
    const line = screen.getByRole('status')
    // Hands already up when the room opens are not read out.
    act(() => vi.advanceTimersByTime(2000))
    expect(line).toHaveTextContent('')

    act(() => useRoom.setState({ hands: raised(['a', 'k']) }))
    act(() => useRoom.setState({ hands: raised(['a', 'k', 'l']) }))
    act(() => vi.advanceTimersByTime(1000))
    expect(line).toHaveTextContent('Kenji and Lucía raised their hands')

    // The next one waits for the pause between sentences, then is said alone.
    act(() => vi.advanceTimersByTime(2600))
    // Amina speaks (not a new hand), ends her turn, then raises her hand again: that one is.
    act(() => useRoom.setState({ hands: raised(['k', 'l'], 'a') }))
    act(() => useRoom.setState({ hands: raised(['k', 'l']) }))
    act(() => useRoom.setState({ hands: raised(['k', 'l', 'a']) }))
    act(() => vi.advanceTimersByTime(3000))
    expect(line).toHaveTextContent('Amina raised a hand')
  })

  it('tells a participant their own place when it changes, and when their hand is down', () => {
    vi.useFakeTimers()
    enter(lucia, raised(['a', 'k', 'l']))
    render(<CallAnnouncer />)
    const line = screen.getByRole('status')
    act(() => vi.advanceTimersByTime(2000))
    expect(line).toHaveTextContent('')
    // Someone else's hand going up says nothing to Lucía.
    act(() => useRoom.setState({ hands: raised(['a', 'k', 'l', 'n']) }))
    act(() => vi.advanceTimersByTime(1500))
    expect(line).toHaveTextContent('')
    act(() => useRoom.setState({ hands: raised(['k', 'l'], 'a') }))
    act(() => vi.advanceTimersByTime(1500))
    expect(line).toHaveTextContent('You are 2nd')
    act(() => vi.advanceTimersByTime(3000))
    act(() => useRoom.setState({ hands: raised(['k'], 'l') }))
    act(() => vi.advanceTimersByTime(1500))
    expect(line).toHaveTextContent('You have the floor')
    act(() => vi.advanceTimersByTime(3000))
    act(() => useRoom.setState({ hands: NO_HANDS }))
    act(() => vi.advanceTimersByTime(1500))
    expect(line).toHaveTextContent('Your hand is down.')
  })
})

describe('PeopleList with hands', () => {
  it('marks a raised hand and the floor in words and with a hand on the character', () => {
    render(<PeopleList members={members} online={['n', 'a', 'k', 'l']} meId="n" hands={raised(['k'], 'a')} />)
    const row = (name: string) => screen.getByText(name).closest('li')!
    expect(row('Kenji')).toHaveClass('is-hand')
    expect(row('Kenji')).toHaveTextContent('Kenji, hand raised')
    expect(row('Kenji').querySelector('.people__hand')).not.toBeNull()
    expect(row('Amina')).toHaveClass('is-floor')
    expect(row('Amina')).toHaveTextContent('Amina, has the floor')
    expect(row('Lucía')).not.toHaveClass('is-hand')
    expect(row('Lucía').querySelector('.people__hand')).toBeNull()
  })
})
