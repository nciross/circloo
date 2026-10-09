import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../../i18n'
import type { Member, Message, RoomSettings as Settings } from '../../../api/circles'
import { DEFAULT_SETTINGS, useRoom } from '../room'
import { ChatPanel } from './ChatPanel'
import { RoomSettings } from './RoomSettings'
import { CHAT_GATHER } from './grouping'

const nadia: Member = { id: 'n', name: 'Nadia', role: 'animator', character: 'panda', ring: 0 }
const amina: Member = { id: 'a', name: 'Amina', role: 'participant', character: 'robot', ring: 0 }
const kenji: Member = { id: 'k', name: 'Kenji', role: 'participant', character: 'fox', ring: 2 }
const members = [nadia, amina, kenji]

const T0 = Date.parse('2026-10-09T10:00:00Z')
let next = 1
const msg = (memberId: string, text: string, over: Partial<Message> = {}): Message => ({
  id: next++,
  activityId: 'presentation',
  memberId,
  kind: 'member',
  text,
  at: new Date(T0 + next * 1000).toISOString(),
  likes: 0,
  liked: false,
  hidden: false,
  replyToId: null,
  ...over,
})

const hub = {
  say: vi.fn<(text: string) => Promise<void>>(),
  likeMessage: vi.fn<(id: number) => Promise<void>>(),
  hideMessage: vi.fn<(id: number, hidden: boolean) => Promise<void>>(),
  setRoomSettings: vi.fn<(s: Settings) => Promise<void>>(),
}
const refuse = (code: string) => Promise.reject(new Error(`An unexpected error occurred invoking 'Say' on the server. HubException: ${code}`))

function enter(me: Member, messages: Message[], settings: Settings = DEFAULT_SETTINGS) {
  useRoom.setState({ circleId: 'c1', me, members, messages, settings, typing: [], thinking: false, draft: '', error: null, ...hub })
}

beforeEach(async () => {
  for (const f of Object.values(hub)) f.mockReset().mockResolvedValue(undefined)
  await i18n.changeLanguage('en')
})
afterEach(() => vi.useRealTimers())

describe('ChatPanel', () => {
  it('groups one sender’s consecutive messages under one name with their character and ring', () => {
    enter(amina, [msg('k', 'Hello'), msg('k', 'Bravo 👏'), msg('a', 'Thanks!'), msg('n', 'Next slide')])
    const { container } = render(<ChatPanel activityId="presentation" hideEnd />)
    const groups = container.querySelectorAll('.chat__group')
    expect(groups).toHaveLength(3)
    expect(groups[0]!.querySelectorAll('.chat__msg')).toHaveLength(2)
    expect(groups[0]!.querySelectorAll('.chat__from')).toHaveLength(1)
    expect(groups[0]!.querySelector('.char--ring-2')).not.toBeNull()
    // Yours: no name, at the inline end. The animator is named in words.
    expect(groups[1]).toHaveClass('is-mine')
    expect(groups[1]!.querySelector('.chat__from')).toBeNull()
    expect(within(groups[2] as HTMLElement).getByText('Animator')).toBeInTheDocument()
  })

  it('likes someone else’s message and shows “you liked” by the word and the filled heart', async () => {
    const theirs = msg('k', 'Hello', { likes: 2 })
    enter(amina, [theirs, msg('a', 'Mine', { likes: 1 })])
    const { rerender } = render(<ChatPanel activityId="presentation" hideEnd />)
    const like = screen.getByRole('button', { name: /^Like/ })
    expect(like).toHaveAttribute('aria-pressed', 'false')
    expect(like).toHaveTextContent('2')
    await userEvent.click(like)
    expect(hub.likeMessage).toHaveBeenCalledWith(theirs.id)
    // Your own message has a count, never a like button.
    expect(screen.getAllByRole('button', { name: /Like/ })).toHaveLength(1)
    expect(screen.getByText('1 like')).toBeInTheDocument()

    act(() => useRoom.setState((s) => ({ messages: s.messages.map((m) => (m.id === theirs.id ? { ...m, liked: true, likes: 3 } : m)) })))
    rerender(<ChatPanel activityId="presentation" hideEnd />)
    const liked = screen.getByRole('button', { name: /^Liked/ })
    expect(liked).toHaveAttribute('aria-pressed', 'true')
    expect(within(liked).getByText('Liked')).not.toHaveClass('visually-hidden')
    expect(liked.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
  })

  it('lets the animator hide a message and show it again; a hidden one is marked, never liked', async () => {
    const m = msg('k', 'Oops')
    enter(nadia, [m])
    const { rerender } = render(<ChatPanel activityId="presentation" hideEnd />)
    await userEvent.click(screen.getByRole('button', { name: 'Hide Kenji’s message from everyone' }))
    expect(hub.hideMessage).toHaveBeenCalledWith(m.id, true)

    act(() => useRoom.setState({ messages: [{ ...m, hidden: true }] }))
    rerender(<ChatPanel activityId="presentation" hideEnd />)
    expect(screen.getByText('Hidden from the circle')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Like/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show again' }))
    expect(hub.hideMessage).toHaveBeenLastCalledWith(m.id, false)
  })

  it('participants never see the hide button nor the chat switches', () => {
    enter(amina, [msg('k', 'Hi')])
    render(<ChatPanel activityId="presentation" hideEnd />)
    expect(screen.queryByRole('button', { name: /Hide/ })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Chat' })).toBeNull()
  })

  it('says why participants cannot write when the chat is paused, and keeps the animator writing', () => {
    enter(amina, [msg('k', 'Hi')], { ...DEFAULT_SETTINGS, chat: 'paused' })
    const { unmount } = render(<ChatPanel activityId="presentation" hideEnd />)
    expect(screen.getByText('The animator paused the chat').closest('[role=status]')).not.toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    // Earlier messages stay readable.
    expect(screen.getByText('Hi')).toBeInTheDocument()
    unmount()

    enter(nadia, [], { ...DEFAULT_SETTINGS, chat: 'paused' })
    render(<ChatPanel activityId="presentation" hideEnd />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByText('Paused for participants. You can still write.')).toBeInTheDocument()
  })

  it('counts down in slow mode after your message, and turns the hub’s refusal into the countdown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: T0 })
    enter(amina, [], { ...DEFAULT_SETTINGS, chat: 'slow' })
    render(<ChatPanel activityId="presentation" hideEnd />)
    expect(screen.getByText('Slow mode: one message every 10 seconds.')).toBeInTheDocument()

    // Your message lands (the hub broadcasts it to you too): the wait runs from it.
    act(() => useRoom.setState({ messages: [msg('a', 'First', { at: new Date(Date.now()).toISOString() })] }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })
    expect(screen.getByText(/you can write again in [67] seconds/)).toBeInTheDocument()
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toHaveAttribute('aria-disabled', 'true')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000)
    })
    expect(screen.getByText('Slow mode: one message every 10 seconds.')).toBeInTheDocument()

    // Another tab sent meanwhile: the hub says how long is left, and that is a countdown, not an error.
    hub.say.mockImplementationOnce(() => {
      useRoom.setState({ error: 'slow-mode:4' })
      return refuse('slow-mode:4')
    })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Again' } })
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(hub.say).toHaveBeenCalledWith('Again')
    expect(screen.getByText(/you can write again in 4 seconds/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('textbox')).toHaveValue('Again')
  })

  it('stays put while you read older messages and offers a “New messages” button', async () => {
    enter(amina, [msg('k', 'One'), msg('k', 'Two')])
    render(<ChatPanel activityId="presentation" hideEnd />)
    const log = screen.getByRole('region', { name: 'Conversation' })
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 300 })
    log.scrollTop = 200
    fireEvent.scroll(log)

    act(() => useRoom.setState((s) => ({ messages: [...s.messages, msg('k', 'Three'), msg('n', 'Four'), msg('a', 'mine')] })))
    expect(log.scrollTop).toBe(200)
    const jump = screen.getByRole('button', { name: '2 new messages' })
    await userEvent.click(jump)
    expect(log.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: /new messages/ })).toBeNull()
  })

  it('announces new messages politely in one batch, never the history', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: T0 })
    enter(amina, [msg('k', 'Old')])
    const { container } = render(<ChatPanel activityId="presentation" hideEnd />)
    const say = container.querySelector('[data-slot="chat-say"]')!
    expect(say).toHaveAttribute('role', 'status')
    act(() => useRoom.setState((s) => ({ messages: [...s.messages, msg('k', 'A'), msg('n', 'B'), msg('a', 'mine'), msg('k', 'C')] })))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHAT_GATHER + 50)
    })
    expect(say).toHaveTextContent('3 new messages')

    act(() => useRoom.setState((s) => ({ messages: [...s.messages, msg('k', 'Bravo')] })))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHAT_GATHER + 50)
    })
    // Not yet: a few seconds between announcements.
    expect(say).not.toHaveTextContent('Kenji: Bravo')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(say).toHaveTextContent('Kenji: Bravo')
  })
})

describe('RoomSettings', () => {
  it('sets the chat open, slow or paused and switches reactions, from the hub’s answer', async () => {
    enter(nadia, [])
    const { rerender } = render(<RoomSettings />)
    await userEvent.click(screen.getByRole('button', { name: 'Slow' }))
    expect(hub.setRoomSettings).toHaveBeenCalledWith({ chat: 'slow', reactions: true, pirikooQuiet: false })
    const reactions = screen.getByRole('switch', { name: 'Reactions' })
    expect(reactions).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(reactions)
    expect(hub.setRoomSettings).toHaveBeenLastCalledWith({ chat: 'open', reactions: false, pirikooQuiet: false })

    act(() => useRoom.setState({ settings: { chat: 'paused', reactions: false, pirikooQuiet: true } }))
    rerender(<RoomSettings />)
    expect(screen.getByRole('button', { name: 'Paused' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('switch', { name: 'Reactions' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Participants can read but not write. You still can.')).toBeInTheDocument()
  })

  it('says a refusal in words', async () => {
    enter(nadia, [])
    hub.setRoomSettings.mockImplementationOnce(() => refuse('animator-only'))
    render(<RoomSettings reactions={false} />)
    expect(screen.queryByRole('switch')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Paused' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the animator can do that.')
  })
})
