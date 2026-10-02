import { useEffect } from 'react'
import { create } from 'zustand'
import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr'
import { api } from '../../api/client'
import type { BoardNote, CircleView, Member, Message, NoteColor } from '../../api/circles'

type Status = 'connecting' | 'live' | 'reconnecting' | 'offline'

interface RoomState {
  circleId: string | null
  joinCode: string | null
  activities: string[]
  me: Member | null
  members: Member[]
  online: string[]
  messages: Message[]
  notes: BoardNote[]
  /** Members who just arrived: their seat hops for a moment. */
  arrivals: string[]
  /** A short sentence for screen readers about the latest arrival. */
  announcement: string
  activity: string | null
  /** Others writing in the chat right now ("Kenji is typing…"). */
  typing: string[]
  thinking: boolean
  draft: string
  closed: boolean
  status: Status
  error: string | null
  connection: HubConnection | null
  load: (view: CircleView) => void
  say: (text: string) => Promise<void>
  ask: (text: string) => Promise<void>
  start: (activityId: string) => Promise<void>
  end: () => Promise<void>
  addNote: (column: string, text: string, color: NoteColor) => Promise<void>
  editNote: (id: number, text: string) => Promise<void>
  moveNote: (id: number, column: string) => Promise<void>
  deleteNote: (id: number) => Promise<void>
  vote: (id: number) => Promise<void>
  /** Tells the others you are writing; sent at most every few seconds, never an error. */
  notifyTyping: () => void
  clearError: () => void
}

/** Send "typing" at most this often while someone writes; the server drops anything faster. */
const TYPING_EVERY = 2500
/** A typing line fades this long after the last sign of life. */
const TYPING_TTL = 4000
let lastTyping = 0
const typingTimers = new Map<string, number>()

function stopTyping(memberId: string) {
  window.clearTimeout(typingTimers.get(memberId))
  typingTimers.delete(memberId)
  useRoom.setState((s) => (s.typing.includes(memberId) ? { typing: s.typing.filter((x) => x !== memberId) } : s))
}

function clearTyping() {
  for (const timer of typingTimers.values()) window.clearTimeout(timer)
  typingTimers.clear()
  lastTyping = 0
  useRoom.setState({ typing: [] })
}

const invoke = async (method: string, ...args: unknown[]) => {
  const { connection } = useRoom.getState()
  if (!connection || connection.state !== HubConnectionState.Connected) throw new Error('offline')
  try {
    await connection.invoke(method, ...args)
  } catch (e) {
    // Hub errors carry a short code (animator-only, message-unsafe…) after "HubException: ".
    const code = e instanceof Error ? (e.message.split('HubException: ')[1] ?? 'failed') : 'failed'
    useRoom.setState({ error: code })
    throw e
  }
}

/** Live state of the circle you are in (one at a time). */
export const useRoom = create<RoomState>()((set) => ({
  circleId: null,
  joinCode: null,
  activities: [],
  me: null,
  members: [],
  online: [],
  messages: [],
  notes: [],
  arrivals: [],
  announcement: '',
  activity: null,
  typing: [],
  thinking: false,
  draft: '',
  closed: false,
  status: 'connecting',
  error: null,
  connection: null,
  load: (view) =>
    set({
      circleId: view.id,
      joinCode: view.joinCode,
      activities: view.activities,
      me: view.me,
      members: view.members,
      messages: view.messages,
      notes: view.notes,
      activity: view.currentActivity,
      closed: view.status === 'closed',
      online: [],
      typing: [],
      thinking: false,
      draft: '',
      error: null,
    }),
  say: async (text) => {
    await invoke('Say', text)
    lastTyping = 0
  },
  ask: async (text) => {
    await invoke('AskCircloo', text)
    lastTyping = 0
  },
  start: (activityId) => invoke('StartActivity', activityId),
  end: () => invoke('EndActivity'),
  addNote: (column, text, color) => invoke('AddNote', column, text, color),
  editNote: (id, text) => invoke('EditNote', id, text),
  moveNote: (id, column) => invoke('MoveNote', id, column),
  deleteNote: (id) => invoke('DeleteNote', id),
  vote: (id) => invoke('Vote', id),
  notifyTyping: () => {
    const { connection } = useRoom.getState()
    const now = Date.now()
    if (!connection || connection.state !== HubConnectionState.Connected || now - lastTyping < TYPING_EVERY) return
    lastTyping = now
    connection.invoke('Typing').catch(() => undefined)
  },
  clearError: () => set({ error: null }),
}))

/** Anything that happened between loading the page and joining the live group is fetched once more. */
async function resync(id: string) {
  const view = await api<CircleView>(`/api/circles/${id}`)
  useRoom.setState({
    members: view.members,
    messages: view.messages,
    notes: view.notes,
    activity: view.currentActivity,
    closed: view.status === 'closed',
  })
}

/** Opens the room's real-time connection for as long as the component lives. */
export function useCircleConnection(view: CircleView | undefined) {
  const id = view?.id
  const isClosed = view?.status === 'closed'
  useEffect(() => {
    if (!id || isClosed) return
    const connection = new HubConnectionBuilder()
      .withUrl('/hubs/circle')
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()
    const add = (m: Message) => {
      // A message from someone ends their "typing…" at once.
      if (m.memberId) stopTyping(m.memberId)
      useRoom.setState((s) => (s.messages.some((x) => x.id === m.id) ? s : { messages: [...s.messages, m], draft: m.kind === 'ai' ? '' : s.draft }))
    }

    connection.on('Presence', (online: string[]) => useRoom.setState({ online }))
    connection.on('MemberJoined', (m: Member) => {
      useRoom.setState((s) => (s.members.some((x) => x.id === m.id) ? s : { members: [...s.members, m], arrivals: [...s.arrivals, m.id], announcement: m.name }))
      window.setTimeout(() => useRoom.setState((s) => ({ arrivals: s.arrivals.filter((x) => x !== m.id) })), 1600)
    })
    connection.on('Activity', (a: { activityId: string | null }) => useRoom.setState({ activity: a.activityId }))
    connection.on('Message', add)
    connection.on('AiThinking', (thinking: boolean) => useRoom.setState((s) => ({ thinking, draft: thinking ? '' : s.draft })))
    connection.on('AiDelta', (d: { text: string }) => useRoom.setState((s) => ({ draft: s.draft + d.text })))
    connection.on('Closed', () => useRoom.setState({ closed: true, status: 'offline' }))
    connection.on('NoteChanged', (n: BoardNote) =>
      useRoom.setState((s) => ({ notes: s.notes.some((x) => x.id === n.id) ? s.notes.map((x) => (x.id === n.id ? n : x)) : [...s.notes, n] })))
    connection.on('NoteDeleted', (id: number) => useRoom.setState((s) => ({ notes: s.notes.filter((x) => x.id !== id) })))
    connection.on('Typing', (memberId: string) => {
      useRoom.setState((s) => (s.typing.includes(memberId) ? s : { typing: [...s.typing, memberId] }))
      window.clearTimeout(typingTimers.get(memberId))
      typingTimers.set(memberId, window.setTimeout(() => stopTyping(memberId), TYPING_TTL))
    })
    connection.onreconnecting(() => useRoom.setState({ status: 'reconnecting' }))
    connection.onreconnected(async () => {
      useRoom.setState({ status: 'live' })
      await connection.invoke('Enter', id).catch(() => undefined)
      await resync(id).catch(() => undefined)
    })
    connection.onclose(() => useRoom.setState({ status: 'offline' }))

    useRoom.setState({ connection, status: 'connecting' })
    let cancelled = false
    connection
      .start()
      .then(() => (cancelled ? undefined : connection.invoke<string[]>('Enter', id)))
      .then((online) => {
        if (!cancelled && online) useRoom.setState({ online, status: 'live' })
        return cancelled ? undefined : resync(id)
      })
      .catch(() => {
        if (!cancelled) useRoom.setState({ status: 'offline' })
      })
    return () => {
      cancelled = true
      clearTyping()
      useRoom.setState({ connection: null })
      void connection.stop()
    }
  }, [id, isClosed])
}
