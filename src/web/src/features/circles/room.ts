import { useEffect } from 'react'
import { create } from 'zustand'
import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr'
import { api } from '../../api/client'
import { bindPresentation, useLive } from './present/presentation'
import { bindStage, configureStage, resetStage, useStage } from './stage/stage'
import { PRESENTATION } from './catalog'
import { bindReactions, useReactions, type ReactionKind } from './room/reactions'
import type { BoardNote, CanvasColor, CanvasNote, CanvasShape, CanvasSize, CanvasSticker, CircleView, Member, Message, NoteColor, RoomSettings } from '../../api/circles'

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
  canvas: CanvasNote[]
  /** Where the others point on the canvas, with when it last moved (ms). Never stored anywhere. */
  cursors: Record<string, { x: number; y: number; at: number }>
  /** Members who just arrived: their seat hops for a moment. */
  arrivals: string[]
  /** A short sentence for screen readers about the latest arrival. */
  announcement: string
  activity: string | null
  /** Who started the current round (member id), when known: the work bar names them. */
  startedBy: string | null
  /** Others writing in the chat right now ("Kenji is typing…"). */
  typing: string[]
  thinking: boolean
  draft: string
  closed: boolean
  /** The animator's switches for the live room (spec 008): chat mode, reactions, Pirikoo quiet. */
  settings: RoomSettings
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
  addCanvasNote: (x: number, y: number, text: string, color: CanvasColor, size: CanvasSize, shape: CanvasShape) => Promise<void>
  moveCanvasNote: (id: number, x: number, y: number) => Promise<void>
  editCanvasNote: (id: number, text: string) => Promise<void>
  styleCanvasNote: (id: number, color: CanvasColor, size: CanvasSize, shape: CanvasShape, sticker: CanvasSticker | null) => Promise<void>
  deleteCanvasNote: (id: number) => Promise<void>
  /** Shares your pointer on the canvas, a dozen times a second at most; never an error. */
  sendCursor: (x: number, y: number) => void
  /** Tells the others you are writing; sent at most every few seconds, never an error. */
  notifyTyping: () => void
  /** Presenting (spec 006 US3): animator only, the server refuses everyone else. */
  startPresentation: (presentationId: string) => Promise<void>
  goToSlide: (position: number) => Promise<void>
  setBlank: (blank: boolean) => Promise<void>
  endPresentation: () => Promise<void>
  openQuestion: () => Promise<void>
  lockQuestion: () => Promise<void>
  revealResults: () => Promise<void>
  /** A participant answers the current question (spec 006 US4); the server confirms with MyAnswer. */
  answer: (slideId: string, options: string[]) => Promise<void>
  /**
   * One emoji reaction (spec 008 US4). Never an error: the hub drops it silently when reactions are off, nothing is
   * presented or you are over the limit, so the bar gives its own feedback.
   */
  react: (kind: ReactionKind) => void
  clearError: () => void
}

/** What a room starts with until the hub says otherwise (contracts/hub.md defaults). */
export const DEFAULT_SETTINGS: RoomSettings = { chat: 'open', reactions: true, pirikooQuiet: false }

/** Send "typing" at most this often while someone writes; the server drops anything faster. */
const TYPING_EVERY = 2500
/** A typing line fades this long after the last sign of life. */
const TYPING_TTL = 4000
let lastTyping = 0
const CURSOR_EVERY = 80
let lastCursor = 0
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

/** Hub errors carry a short code (animator-only, message-unsafe…) after "HubException: ". */
export const hubCode = (e: unknown) => (e instanceof Error ? (e.message.split('HubException: ')[1] ?? (e.message === 'offline' ? 'offline' : 'failed')) : 'failed')

/** Calls the room's hub; the caller decides what to show when it refuses. */
const call = async (method: string, ...args: unknown[]) => {
  const { connection } = useRoom.getState()
  if (!connection || connection.state !== HubConnectionState.Connected) throw new Error('offline')
  await connection.invoke(method, ...args)
}

const invoke = async (method: string, ...args: unknown[]) => {
  try {
    await call(method, ...args)
  } catch (e) {
    if (e instanceof Error && e.message === 'offline') throw e
    useRoom.setState({ error: hubCode(e) })
    throw e
  }
}

/** The member who started the round, from its "start:" system line (the page load does not carry it otherwise). */
export function starterOf(messages: Message[], activity: string | null): string | null {
  if (!activity) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.kind === 'system' && m.text === `start:${activity}`) return m.memberId
  }
  return null
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
  canvas: [],
  cursors: {},
  arrivals: [],
  announcement: '',
  activity: null,
  startedBy: null,
  typing: [],
  thinking: false,
  draft: '',
  closed: false,
  settings: DEFAULT_SETTINGS,
  status: 'connecting',
  error: null,
  connection: null,
  load: (view) => {
    // The circle view carries the live discussion setting; the stage store keeps it from here on (spec 009).
    useStage.setState({ discussion: view.discussion ?? null })
    set({
      circleId: view.id,
      joinCode: view.joinCode,
      activities: view.activities,
      me: view.me,
      members: view.members,
      messages: view.messages,
      notes: view.notes,
      canvas: view.canvas,
      cursors: {},
      activity: view.currentActivity,
      startedBy: starterOf(view.messages, view.currentActivity),
      closed: view.status === 'closed',
      settings: view.settings ?? DEFAULT_SETTINGS,
      online: [],
      typing: [],
      thinking: false,
      draft: '',
      error: null,
    })
  },
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
  addCanvasNote: (x, y, text, color, size, shape) => invoke('AddCanvasNote', x, y, text, color, size, shape),
  moveCanvasNote: (id, x, y) => invoke('MoveCanvasNote', id, x, y),
  editCanvasNote: (id, text) => invoke('EditCanvasNote', id, text),
  styleCanvasNote: (id, color, size, shape, sticker) => invoke('StyleCanvasNote', id, color, size, shape, sticker),
  deleteCanvasNote: (id) => invoke('DeleteCanvasNote', id),
  sendCursor: (x, y) => {
    const { connection } = useRoom.getState()
    const now = Date.now()
    if (!connection || connection.state !== HubConnectionState.Connected || now - lastCursor < CURSOR_EVERY) return
    lastCursor = now
    connection.invoke('Cursor', Math.round(x * 10) / 10, Math.round(y * 10) / 10).catch(() => undefined)
  },
  notifyTyping: () => {
    const { connection } = useRoom.getState()
    const now = Date.now()
    if (!connection || connection.state !== HubConnectionState.Connected || now - lastTyping < TYPING_EVERY) return
    lastTyping = now
    connection.invoke('Typing').catch(() => undefined)
  },
  startPresentation: (presentationId) => invoke('StartPresentation', presentationId),
  goToSlide: (position) => invoke('GoToSlide', position),
  setBlank: (blank) => invoke('SetBlank', blank),
  endPresentation: () => invoke('EndPresentation'),
  openQuestion: () => invoke('OpenQuestion'),
  lockQuestion: () => invoke('LockQuestion'),
  revealResults: () => invoke('RevealResults'),
  answer: (slideId, options) => invoke('Answer', slideId, options),
  react: (kind) => {
    const { connection } = useRoom.getState()
    if (!connection || connection.state !== HubConnectionState.Connected) return
    connection.invoke('React', kind).catch(() => undefined)
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
    canvas: view.canvas,
    activity: view.currentActivity,
    startedBy: starterOf(view.messages, view.currentActivity),
    closed: view.status === 'closed',
    ...(view.settings ? { settings: view.settings } : {}),
  })
  if (view.discussion) useStage.setState({ discussion: view.discussion })
}

/** Opens the room's real-time connection for as long as the component lives. */
export function useCircleConnection(view: CircleView | undefined) {
  const id = view?.id
  const selfId = view?.me.id
  const isClosed = view?.status === 'closed'
  useEffect(() => {
    if (!id || !selfId || isClosed) return
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

    // Presence updates are grouped on the server (spec 008): one that arrives before Enter returns is the fresher list.
    let presenceSeen = false
    connection.on('Presence', (online: string[]) => {
      presenceSeen = true
      // Someone who left takes their cursor with them.
      useRoom.setState((s) => ({ online, cursors: Object.fromEntries(Object.entries(s.cursors).filter(([id]) => online.includes(id))) }))
    })
    connection.on('MemberJoined', (m: Member) => {
      useRoom.setState((s) => (s.members.some((x) => x.id === m.id) ? s : { members: [...s.members, m], arrivals: [...s.arrivals, m.id], announcement: m.name }))
      window.setTimeout(() => useRoom.setState((s) => ({ arrivals: s.arrivals.filter((x) => x !== m.id) })), 1600)
    })
    connection.on('Activity', (a: { activityId: string | null; startedBy?: string | null }) => {
      useRoom.setState({ activity: a.activityId, startedBy: a.activityId ? (a.startedBy ?? null) : null })
      if (a.activityId !== PRESENTATION) {
        useLive.getState().reset()
        useReactions.getState().reset()
      }
    })
    bindPresentation(connection, () => useRoom.getState().connection === connection)
    bindReactions(connection, () => useRoom.getState().connection === connection)
    connection.on('RoomSettings', (settings: RoomSettings) => {
      if (useRoom.getState().connection === connection) useRoom.setState({ settings })
    })
    // The live discussion (spec 009 T905/T906): the stage store reaches the hub only through this connection.
    configureStage({ circleId: id, selfId, deps: { invoke: (method, ...args) => call(method, ...args) } })
    bindStage(connection, () => useRoom.getState().connection === connection)
    connection.on('Message', add)
    connection.on('AiThinking', (thinking: boolean) => useRoom.setState((s) => ({ thinking, draft: thinking ? '' : s.draft })))
    connection.on('AiDelta', (d: { text: string }) => useRoom.setState((s) => ({ draft: s.draft + d.text })))
    connection.on('Closed', () => {
      useRoom.setState({ closed: true, status: 'offline' })
      resetStage()
    })
    connection.on('NoteChanged', (n: BoardNote) =>
      useRoom.setState((s) => ({ notes: s.notes.some((x) => x.id === n.id) ? s.notes.map((x) => (x.id === n.id ? n : x)) : [...s.notes, n] })))
    connection.on('NoteDeleted', (id: number) => useRoom.setState((s) => ({ notes: s.notes.filter((x) => x.id !== id) })))
    connection.on('CanvasChanged', (n: CanvasNote) =>
      useRoom.setState((s) => ({ canvas: s.canvas.some((x) => x.id === n.id) ? s.canvas.map((x) => (x.id === n.id ? n : x)) : [...s.canvas, n] })))
    connection.on('CanvasDeleted', (id: number) => useRoom.setState((s) => ({ canvas: s.canvas.filter((x) => x.id !== id) })))
    connection.on('Cursor', (memberId: string, x: number, y: number) =>
      useRoom.setState((s) => ({ cursors: { ...s.cursors, [memberId]: { x, y, at: Date.now() } } })))
    connection.on('Typing', (memberId: string) => {
      useRoom.setState((s) => (s.typing.includes(memberId) ? s : { typing: [...s.typing, memberId] }))
      window.clearTimeout(typingTimers.get(memberId))
      typingTimers.set(memberId, window.setTimeout(() => stopTyping(memberId), TYPING_TTL))
    })
    connection.onreconnecting(() => useRoom.setState({ status: 'reconnecting' }))
    connection.onreconnected(async () => {
      useRoom.setState({ status: 'live' })
      // Entering again pushes the current presentation, if any; a stale one must not stay on screen.
      useLive.getState().reset()
      await connection.invoke('Enter', id).catch(() => undefined)
      await resync(id).catch(() => undefined)
    })
    let cancelled = false
    // Our own stop() on leaving is not "offline": the next room must start from "connecting", not announce a change.
    connection.onclose(() => {
      if (!cancelled) useRoom.setState({ status: 'offline' })
    })

    useRoom.setState({ connection, status: 'connecting' })
    connection
      .start()
      .then(() => (cancelled ? undefined : connection.invoke<string[]>('Enter', id)))
      .then((online) => {
        if (!cancelled && online) useRoom.setState(presenceSeen ? { status: 'live' } : { online, status: 'live' })
        return cancelled ? undefined : resync(id)
      })
      .catch(() => {
        if (!cancelled) useRoom.setState({ status: 'offline' })
      })
    return () => {
      cancelled = true
      clearTyping()
      useLive.getState().reset()
      useReactions.getState().reset()
      resetStage()
      useRoom.setState({ connection: null, status: 'connecting' })
      void connection.stop()
    }
  }, [id, selfId, isClosed])
}
