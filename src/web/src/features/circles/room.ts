import { useEffect } from 'react'
import { create } from 'zustand'
import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr'
import { api } from '../../api/client'
import { bindPresentation, useLive } from './present/presentation'
import { bindStage, configureStage, resetStage, useStage } from './stage/stage'
import { PRESENTATION } from './catalog'
import { bindReactions, useReactions, type ReactionKind } from './room/reactions'
import { cleanHands, NO_HANDS } from './room/hands'
import { patchMessage, upsertMessage } from './room/grouping'
import { addLines, handsChanges, isLineNotice, type LiveEvent, type LiveLine } from './room/liveLines'
import type { BoardNote, CanvasColor, CanvasNote, CanvasShape, CanvasSize, CanvasSticker, CircleView, HandsView, Member, Message, NoteColor, RoomSettings } from '../../api/circles'

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
  /** The room's switches (spec 008): the chat (paused is "Chat off"), reactions, Pirikoo quiet. */
  settings: RoomSettings
  /** Raised hands, oldest first, and who has the floor (spec 008 US5). Names come from `members`. */
  hands: HandsView
  /**
   * Live lines for the conversation (spec 009 US5 #3): call notices and hands, made in this tab from hub events and
   * never stored, so a reload starts without them.
   */
  lines: LiveLine[]
  /**
   * The chat mode to come back to when the chat is switched on again from the call's Chat switch, so slow mode is not
   * lost by pausing; the last open or slow mode this tab saw.
   */
  chatResume: 'open' | 'slow'
  status: Status
  error: string | null
  connection: HubConnection | null
  load: (view: CircleView) => void
  say: (text: string) => Promise<void>
  /** Answers a member message, one level only (spec 009 US5 #2); refusals as for `say`, plus `reply-invalid`. */
  reply: (parentId: number, text: string) => Promise<void>
  ask: (text: string) => Promise<void>
  /** Toggles your like on someone else's message (spec 008 US3); the hub answers with `MyLike` and the new count. */
  likeMessage: (id: number) => Promise<void>
  /** Animator only: hides a message from everyone else, or shows it again. */
  hideMessage: (id: number, hidden: boolean) => Promise<void>
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
  /** Animator only: changes the room's switches; the hub sends `RoomSettings` to everyone, this tab included. */
  setRoomSettings: (settings: RoomSettings) => Promise<void>
  /**
   * One emoji reaction (spec 008 US4). Never an error: the hub drops it silently when reactions are off, nothing is
   * presented or you are over the limit, so the bar gives its own feedback.
   */
  react: (kind: ReactionKind) => void
  /**
   * Hands (spec 008 US5). They throw the hub's code (`hand-invalid`, `slow-down`…) to the caller, which says it where
   * the hand was pressed; they never set the room's `error`.
   */
  raiseHand: () => Promise<void>
  /** Your own hand, or (the animator) someone else's; lowering the speaker's hand ends their turn. */
  lowerHand: (memberId?: string) => Promise<void>
  lowerAllHands: () => Promise<void>
  giveFloor: (memberId: string) => Promise<void>
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

/** A call is on in this circle (spec 009): reactions are allowed then, presentation or not. */
const callOn = () => useStage.getState().discussion?.on ?? false

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

let lineSeq = 0

/** Adds live lines after the newest message, in the round that is on. */
function addLiveLines(events: LiveEvent[]) {
  if (events.length === 0) return
  useRoom.setState((s) => ({
    lines: addLines(s.lines, events, {
      afterId: s.messages.reduce((max, m) => Math.max(max, m.id), 0),
      activityId: s.activity,
      at: Date.now(),
      seq: () => ++lineSeq,
    }),
  }))
}

const resumeOf = (chat: RoomSettings['chat'] | undefined, fallback: 'open' | 'slow' = 'open'): 'open' | 'slow' =>
  chat === 'open' || chat === 'slow' ? chat : fallback

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
  hands: NO_HANDS,
  lines: [],
  chatResume: 'open',
  status: 'connecting',
  error: null,
  connection: null,
  load: (view) => {
    // The circle view carries the call's setting; the stage store keeps it from here on (spec 009). Hands stay here.
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
      chatResume: resumeOf(view.settings?.chat),
      hands: cleanHands(view.hands),
      lines: [],
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
  reply: async (parentId, text) => {
    await invoke('Reply', parentId, text)
    lastTyping = 0
  },
  ask: async (text) => {
    await invoke('AskCircloo', text)
    lastTyping = 0
  },
  // Not through `invoke`: a refused like or hide is said beside the chat, the composer's error line stays for sending.
  likeMessage: (id) => call('LikeMessage', id),
  hideMessage: (id, hidden) => call('HideMessage', id, hidden),
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
  // Not through `invoke`: the switch shows its own refusal, the room's error line stays for the rounds.
  setRoomSettings: (settings) => call('SetRoomSettings', settings),
  react: (kind) => {
    const { connection } = useRoom.getState()
    if (!connection || connection.state !== HubConnectionState.Connected) return
    connection.invoke('React', kind).catch(() => undefined)
  },
  raiseHand: () => call('RaiseHand'),
  lowerHand: (memberId) => call('LowerHand', memberId ?? null),
  lowerAllHands: () => call('LowerAllHands'),
  giveFloor: (memberId) => call('GiveFloor', memberId),
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
    ...(view.settings ? { settings: view.settings, chatResume: resumeOf(view.settings.chat, useRoom.getState().chatResume) } : {}),
    ...(view.hands ? { hands: cleanHands(view.hands) } : {}),
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
      // An upsert by id in id order: a message shown again, hidden (the animator's copy) or with new likes replaces the old one.
      useRoom.setState((s) => ({ messages: upsertMessage(s.messages, m), draft: m.kind === 'ai' ? '' : s.draft }))
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
        // A call keeps its reactions whatever the round (spec 009 US8).
        if (!callOn()) useReactions.getState().reset()
      }
    })
    bindPresentation(connection, () => useRoom.getState().connection === connection)
    bindReactions(connection, () => useRoom.getState().connection === connection, callOn)
    connection.on('Discussion', (d: { on?: boolean } | null) => {
      // The call ended with nothing presented: its reactions go with it.
      if (useRoom.getState().connection === connection && !d?.on && useRoom.getState().activity !== PRESENTATION) useReactions.getState().reset()
    })
    connection.on('Hands', (view: unknown) => {
      if (useRoom.getState().connection !== connection) return
      const before = useRoom.getState().hands
      const after = cleanHands(view)
      useRoom.setState({ hands: after })
      addLiveLines(handsChanges(before, after))
    })
    // The call's notices to the whole circle also leave a line in the conversation (the stage store shows the notice).
    connection.on('CallNotice', (kind: unknown, byMemberId?: unknown) => {
      if (useRoom.getState().connection !== connection || typeof kind !== 'string' || !isLineNotice(kind)) return
      addLiveLines([{ kind: 'notice', notice: kind, by: typeof byMemberId === 'string' ? byMemberId : null }])
    })
    // The group call (spec 009 T923): the stage store reaches the hub only through this connection.
    configureStage({ circleId: id, deps: { invoke: (method, ...args) => call(method, ...args) } })
    bindStage(connection, () => useRoom.getState().connection === connection)
    connection.on('RoomSettings', (settings: RoomSettings) => {
      if (useRoom.getState().connection === connection && settings) useRoom.setState((s) => ({ settings, chatResume: resumeOf(settings.chat, s.chatResume) }))
    })
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
    // The chat's moderation and likes (spec 008 US3). The animator keeps a hidden message, marked: their copy comes as `Message`.
    connection.on('MessageHidden', (messageId: number) => {
      if (useRoom.getState().me?.role === 'animator') return
      useRoom.setState((s) => ({ messages: s.messages.filter((x) => x.id !== messageId) }))
    })
    connection.on('MessageLikes', (messageId: number, count: number) =>
      useRoom.setState((s) => ({ messages: patchMessage(s.messages, messageId, { likes: count }) })))
    connection.on('MyLike', (messageId: number, liked: boolean) =>
      useRoom.setState((s) => ({ messages: patchMessage(s.messages, messageId, { liked }) })))
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
