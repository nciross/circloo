import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../../i18n'
import type { Member, Message, RoomSettings as Settings } from '../../../api/circles'
import { DEFAULT_SETTINGS, useRoom } from '../room'
import { ChatPanel } from './ChatPanel'
import { RoomSettings } from './RoomSettings'
import { CHAT_GATHER } from './grouping'
import type { LiveLine } from './liveLines'

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
  reply: vi.fn<(parentId: number, text: string) => Promise<void>>(),
  likeMessage: vi.fn<(id: number) => Promise<void>>(),
  hideMessage: vi.fn<(id: number, hidden: boolean) => Promise<void>>(),
  setRoomSettings: vi.fn<(s: Settings) => Promise<void>>(),
}
const refuse = (code: string) => Promise.reject(new Error(`An unexpected error occurred invoking 'Say' on the server. HubException: ${code}`))

function enter(me: Member, messages: Message[], settings: Settings = DEFAULT_SETTINGS) {
  useRoom.setState({ circleId: 'c1', me, members, messages, settings, lines: [], typing: [], thinking: false, draft: '', error: null, ...hub })
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
    log.scrollTop = 700
    fireEvent.scroll(log)
    // The reader scrolls up.
    log.scrollTop = 200
    fireEvent.scroll(log)

    act(() => useRoom.setState((s) => ({ messages: [...s.messages, msg('k', 'Three'), msg('n', 'Four'), msg('a', 'mine')] })))
    expect(log.scrollTop).toBe(200)
    const jump = screen.getByRole('button', { name: '2 new messages' })
    await userEvent.click(jump)
    expect(log.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: /new messages/ })).toBeNull()
  })

  it('keeps following the end when the end moves away without the reader scrolling up', () => {
    enter(amina, [msg('k', 'One')])
    render(<ChatPanel activityId="presentation" hideEnd />)
    const log = screen.getByRole('region', { name: 'Conversation' })
    let height = 1000
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => height })
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 300 })
    log.scrollTop = 700
    fireEvent.scroll(log)
    // A line and the call's notice bar arrive together: the scroll event sees the end 60 px away for a moment.
    height = 1060
    fireEvent.scroll(log)
    expect(log.scrollTop).toBe(1060)
    act(() => useRoom.setState((s) => ({ messages: [...s.messages, msg('k', 'Two')] })))
    expect(screen.queryByRole('button', { name: /new message/ })).toBeNull()
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

describe('ChatPanel: replies and live lines (spec 009 US5, T909)', () => {
  const line = (seq: number, afterId: number, event: LiveLine['event']): LiveLine => ({ seq, afterId, activityId: 'presentation', at: T0, event })

  it('answers a message in a one-level thread: Reply, “Replying to Kenji”, then the reply under it', async () => {
    const parent = msg('k', 'Who brings the cake?')
    const answer = msg('n', 'Lucía does', { replyToId: parent.id })
    enter(amina, [parent, answer])
    const { container } = render(<ChatPanel activityId="presentation" hideEnd />)
    // The reply sits in the thread under its message, with its sender named.
    const thread = container.querySelector(`[data-id="${parent.id}"] .chat__thread`) as HTMLElement
    expect(thread).toHaveAccessibleName(/^1 reply to .Kenji.$/)
    expect(within(thread).getByText('Lucía does')).toBeInTheDocument()
    expect(within(thread).getByText('Nadia')).toBeInTheDocument()
    // One level: the reply itself cannot be answered.
    expect(screen.getAllByRole('button', { name: /^Reply to/ })).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Reply to Kenji' }))
    expect(screen.getByText(/Replying to .*Kenji/)).toBeInTheDocument()
    expect(screen.getByText('Who brings the cake?', { selector: '.composer__reply-quote' })).toBeInTheDocument()
    const field = screen.getByRole('textbox', { name: 'Your reply' })
    expect(field).toHaveFocus()
    expect(field).toHaveAccessibleDescription(/Replying to .*Kenji/)

    await userEvent.type(field, 'I bring the tea{Enter}')
    expect(hub.reply).toHaveBeenCalledWith(parent.id, 'I bring the tea')
    expect(hub.say).not.toHaveBeenCalled()
    expect(screen.queryByText(/Replying to/)).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Message to the circle' })).toHaveValue('')
  })

  it('cancels a reply with Escape or the Cancel button, keeping the text and the focus in the field', async () => {
    enter(amina, [msg('k', 'Hello'), msg('a', 'Mine')])
    render(<ChatPanel activityId="presentation" hideEnd />)
    await userEvent.click(screen.getByRole('button', { name: 'Reply to your message' }))
    expect(screen.getByText('Replying to your message')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox'), 'Draft')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText('Replying to your message')).toBeNull()
    expect(screen.getByRole('textbox')).toHaveValue('Draft')
    expect(screen.getByRole('textbox')).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Reply to Kenji' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel the reply' }))
    expect(screen.queryByText(/Replying to/)).toBeNull()
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('makes the animator write to the circle while answering, never to circloo', async () => {
    enter(nadia, [msg('k', 'Hello')])
    render(<ChatPanel activityId="presentation" hideEnd />)
    expect(screen.getByRole('button', { name: 'circloo' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Reply to Kenji' }))
    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.type(screen.getByRole('textbox'), 'Thanks{Enter}')
    expect(hub.reply).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says so when the message goes while you answer, and turns a refused reply into a new message', async () => {
    const parent = msg('k', 'Hello')
    enter(amina, [parent])
    const { rerender } = render(<ChatPanel activityId="presentation" hideEnd />)
    await userEvent.click(screen.getByRole('button', { name: 'Reply to Kenji' }))
    // The animator hid it: members lose it, and the answer would go out as a new message.
    act(() => useRoom.setState({ messages: [] }))
    rerender(<ChatPanel activityId="presentation" hideEnd />)
    expect(screen.getByRole('alert')).toHaveTextContent('The message you were answering is gone. Yours will be sent as a new message.')
    expect(screen.queryByText(/Replying to/)).toBeNull()

    // The hub refuses a reply whose message went just before: the words stay, ready to go as a new message.
    act(() => useRoom.setState({ messages: [parent] }))
    rerender(<ChatPanel activityId="presentation" hideEnd />)
    hub.reply.mockImplementationOnce(() => {
      useRoom.setState({ error: 'reply-invalid' })
      return refuse('reply-invalid')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Reply to Kenji' }))
    await userEvent.type(screen.getByRole('textbox'), 'Too late{Enter}')
    expect(screen.getByText('That message can no longer be answered. Send yours as a new message.')).toBeInTheDocument()
    expect(screen.queryByText(/Replying to/)).toBeNull()
    expect(screen.getByRole('textbox')).toHaveValue('Too late')
  })

  it('offers no Reply while the chat is paused for you, and marks a reply whose message is not loaded', () => {
    enter(amina, [msg('k', 'Hello'), msg('k', 'About that', { replyToId: 1 })], { ...DEFAULT_SETTINGS, chat: 'paused' })
    render(<ChatPanel activityId="presentation" hideEnd />)
    expect(screen.queryByRole('button', { name: /^Reply/ })).toBeNull()
    expect(screen.getByText('Reply to an earlier message')).toBeInTheDocument()
  })

  it('leads to a reply that went under an earlier message from where it happened', async () => {
    const parent = msg('k', 'Plan A?')
    const between = msg('n', 'Next slide')
    const answer = msg('a', 'Yes, plan A', { replyToId: parent.id })
    enter(amina, [parent, between, answer])
    const { container } = render(<ChatPanel activityId="presentation" hideEnd />)
    const pointer = screen.getByRole('button', { name: /^You replied to .Kenji.Show$/ })
    await userEvent.click(pointer)
    const target = container.querySelector(`.chat__thread [data-id="${answer.id}"]`)
    expect(target).toHaveFocus()
    expect(target).toHaveClass('is-found')
  })

  it('shows live lines in the conversation, never as new messages and never read out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: T0 })
    const first = msg('k', 'Hi')
    enter(amina, [first])
    const { container } = render(<ChatPanel activityId="presentation" hideEnd />)
    const say = container.querySelector('[data-slot="chat-say"]')!
    act(() =>
      useRoom.setState({
        lines: [
          line(1, first.id, { kind: 'notice', notice: 'call-started', by: 'n' }),
          line(2, first.id, { kind: 'hand-up', memberId: 'k' }),
          line(3, first.id, { kind: 'hand-up', memberId: 'n' }),
          line(4, first.id, { kind: 'hand-up', memberId: 'a' }),
          // Another round's line stays in that round's conversation.
          { ...line(5, first.id, { kind: 'floor', memberId: 'k' }), activityId: 'brainstorm' },
        ],
      }),
    )
    const lines = [...container.querySelectorAll('.chat__live')].map((l) => l.textContent?.replace(/[⁨⁩]/g, ''))
    expect(lines).toEqual(['Nadia started a call', '3 hands raised'])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHAT_GATHER + 50)
    })
    expect(say).toHaveTextContent('')
    expect(screen.queryByRole('button', { name: /new message/ })).toBeNull()
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
