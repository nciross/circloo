/**
 * Store and hub bindings of the group call (spec 009, contracts/hub.md and contracts/rest.md), built on the call engine
 * (`call.ts`). The hub carries the switches, the roster, notices and the animator's actions; audio and video go through
 * the call server with a pass fetched once per Join.
 *
 * Nobody asks for a camera or a microphone until a device action runs, everyone joins with both off, and nothing is ever
 * switched on by the server or by a notice. The store reaches the hub only through the injected `invoke` (see
 * `configureStage`) and the engine only through `createEngine`, so both are faked in tests.
 */
import { create } from 'zustand'
import type { HubConnection } from '@microsoft/signalr'
import { ApiError } from '../../../api/client'
import { CALL_NOTICE_KINDS, fetchCallPass, type CallNoticeKind, type CallPass } from '../../../api/discussion'
import type { DiscussionState, HandsView } from '../../../api/circles'
import { mediaSupported, type MediaKind, type MediaProblem } from './media'
import { createCallEngine, type CallConnection, type CallEngine, type CallListener, type CallParticipant, type CallRights } from './call'

export type { CallConnection, CallParticipant, CallRights } from './call'

/**
 * Why joining failed or the call dropped, as a key under `circles.call.errors`. The server's codes come through as they
 * are; `unreachable` is a call server the browser cannot reach, `lost` a connection that did not come back.
 */
export type CallError =
  | 'calls-unavailable' | 'call-off' | 'removed-from-call' | 'try-again' | 'slow-down'
  | 'unreachable' | 'unsupported' | 'lost' | 'joined-elsewhere'

export interface CallNotice {
  id: number
  kind: CallNoticeKind
  byMemberId: string | null
  subjectMemberId: string | null
}

export interface MyDevices {
  mic: boolean
  camera: boolean
}

export type Source = 'microphone' | 'camera'

/**
 * What the animator changed for people in this call, kept from the animator's own successful calls. The hub never sends
 * it back (contracts/hub.md: the notices go to the person), so another animator tab or a reload starts from empty; the
 * server still holds the truth and applies it to every pass.
 */
export interface Moderation {
  microphone: string[]
  camera: string[]
  removed: string[]
}

interface StageState {
  discussion: DiscussionState | null
  /** Member ids in the call, from the call server through the hub (never on the audience screen). */
  roster: string[]
  connection: CallConnection
  error: CallError | null
  /** What the call server lets you publish; null while you are not in the call. */
  myPermissions: CallRights | null
  me: MyDevices
  /** Why the last device did not start; the UI explains it (T907). */
  deviceProblem: { kind: MediaKind; problem: MediaProblem } | null
  /** The browser blocks the call's sound until a tap calls `startAudio`. */
  audioBlocked: boolean
  participants: CallParticipant[]
  notices: CallNotice[]
  /** Raised hands and the floor (spec 008 `Hands`), live from the hub; null until the room loads them. */
  hands: HandsView | null
  /** The animator's mutes and removals in this call, as far as this tab knows (see `Moderation`). */
  moderation: Moderation
  /** Joins the call. Call it from the Join tap: it starts the sound there. */
  join: () => Promise<void>
  leave: () => Promise<void>
  /** Switches the microphone. Asking for the device happens here and only here. */
  setMic: (on: boolean) => Promise<void>
  setCamera: (on: boolean) => Promise<void>
  startAudio: () => Promise<void>
  dismissNotice: (id: number) => void
  /** Starts the call, or changes video and the speaking mode while it is on. The mode stays as it is unless given. */
  enableDiscussion: (videoAllowed: boolean, speaking?: DiscussionState['speaking']) => Promise<void>
  disableDiscussion: () => Promise<void>
  setSpeakingMode: (mode: DiscussionState['speaking']) => Promise<void>
  giveFloor: (memberId: string) => Promise<void>
  /** Lowers the floor holder's hand, which ends their turn (research R33). */
  takeFloor: (memberId: string) => Promise<void>
  muteMember: (memberId: string, source: Source) => Promise<void>
  allowMember: (memberId: string, source: Source) => Promise<void>
  muteEveryone: () => Promise<void>
  removeFromCall: (memberId: string) => Promise<void>
  allowBack: (memberId: string) => Promise<void>
}

export interface StageDeps {
  invoke: (method: string, ...args: unknown[]) => Promise<void>
  fetchPass: (circleId: string) => Promise<CallPass>
  createEngine: (listener: CallListener) => Promise<CallEngine>
}

const offline = () => Promise.reject(new Error('offline'))
const defaults: StageDeps = {
  // Wired to the room's hub by configureStage.
  invoke: offline,
  fetchPass: fetchCallPass,
  createEngine: (listener) => createCallEngine(listener),
}

let deps: StageDeps = defaults
let circleId: string | null = null
/** The engine of the current join; events of an older one are ignored by their generation. */
let engine: CallEngine | null = null
let generation = 0
let noticeId = 0
const MAX_NOTICES = 20
const OFF: MyDevices = { mic: false, camera: false }
const NOT_IN_CALL = { connection: 'idle' as CallConnection, myPermissions: null, me: OFF, participants: [], audioBlocked: false, deviceProblem: null }
const NO_MODERATION: Moderation = { microphone: [], camera: [], removed: [] }
const SERVER_ERRORS = new Set<string>(['calls-unavailable', 'call-off', 'removed-from-call', 'try-again'])
const NOTICE_KINDS = new Set<string>(CALL_NOTICE_KINDS)

/** Says which circle and how to reach the hub. Call it when the room is entered. */
export function configureStage(c: { circleId: string; deps?: Partial<StageDeps> }) {
  void endCall()
  circleId = c.circleId
  deps = { ...defaults, ...c.deps }
}

/** Joining needs WebRTC; devices are checked one by one later. */
export const callSupported = () => typeof RTCPeerConnection !== 'undefined'

/** Local end: the engine disconnects and every track stops; the store forgets the call. */
async function endCall(state: Partial<StageState> = {}) {
  generation++
  const e = engine
  engine = null
  useStage.setState({ ...NOT_IN_CALL, ...state })
  await e?.leave().catch(() => undefined)
}

function listenerFor(gen: number): CallListener {
  const live = () => gen === generation
  const set = (s: Partial<StageState>) => {
    if (live()) useStage.setState(s)
  }
  return {
    onConnection: (connection) => set({ connection }),
    onEnded: (reason) => {
      if (!live()) return
      // Removed and ended arrive as notices from the hub too; they leave nothing to fix.
      if (reason === 'lost') void endCall({ connection: 'failed', error: 'lost' })
      else void endCall({ error: reason === 'elsewhere' ? 'joined-elsewhere' : null })
    },
    onParticipants: (participants) => set({ participants }),
    onRights: (myPermissions) => set({ myPermissions }),
    onDevices: (me) => set({ me }),
    onDeviceProblem: (kind, problem) => set({ deviceProblem: { kind, problem } }),
    onAudioBlocked: (audioBlocked) => set({ audioBlocked }),
  }
}

function passError(e: unknown): CallError {
  if (!(e instanceof ApiError)) return 'try-again'
  if (e.status === 429) return 'slow-down'
  return e.type && SERVER_ERRORS.has(e.type) ? (e.type as CallError) : 'try-again'
}

function announce(kind: CallNoticeKind, byMemberId: string | null, subjectMemberId: string | null) {
  useStage.setState((s) => ({ notices: [...s.notices, { id: ++noticeId, kind, byMemberId, subjectMemberId }].slice(-MAX_NOTICES) }))
}

const call = (method: string, ...args: unknown[]) => deps.invoke(method, ...args)
const withId = (list: string[], id: string) => (list.includes(id) ? list : [...list, id])
const withoutId = (list: string[], id: string) => list.filter((x) => x !== id)
/** Records an animator action in `moderation` once the hub accepted it; a refusal changes nothing. */
async function moderate(method: string, args: unknown[], change: (m: Moderation) => Moderation) {
  await call(method, ...args)
  useStage.setState((s) => ({ moderation: change(s.moderation) }))
}
const inCall = (c: CallConnection) => c === 'connected' || c === 'reconnecting'

export const useStage = create<StageState>()((set, get) => ({
  discussion: null,
  roster: [],
  error: null,
  notices: [],
  hands: null,
  moderation: NO_MODERATION,
  ...NOT_IN_CALL,
  join: async () => {
    const { connection, discussion } = get()
    if (connection === 'joining' || inCall(connection) || !circleId) return
    if (discussion && !discussion.on) return set({ connection: 'failed', error: 'call-off' })
    if (!callSupported()) return set({ connection: 'failed', error: 'unsupported' })
    const gen = ++generation
    set({ ...NOT_IN_CALL, connection: 'joining', error: null })
    // The pass and the engine's code load side by side; the pass is fetched once per join.
    const created = deps.createEngine(listenerFor(gen))
    created.catch(() => undefined)
    let pass: CallPass
    try {
      pass = await deps.fetchPass(circleId)
    } catch (e) {
      void created.then((x) => x.leave()).catch(() => undefined)
      if (gen === generation) set({ connection: 'failed', error: passError(e) })
      return
    }
    let e: CallEngine
    try {
      e = await created
    } catch {
      if (gen === generation) set({ connection: 'failed', error: 'try-again' })
      return
    }
    if (gen !== generation) {
      await e.leave().catch(() => undefined)
      return
    }
    engine = e
    set({ myPermissions: { canSpeak: pass.canSpeak, canVideo: pass.canVideo } })
    try {
      await e.connect(pass)
    } catch {
      if (gen === generation) await endCall({ connection: 'failed', error: 'unreachable' })
      return
    }
    if (gen === generation) set({ connection: 'connected' })
  },
  leave: () => endCall({ error: null }),
  setMic: async (on) => {
    const e = engine
    if (!e || !inCall(get().connection)) return
    if (on) {
      // A revoked microphone (Hand to speak without the floor, muted by the animator) is a disabled button: no request.
      if (!get().myPermissions?.canSpeak) return
      if (!mediaSupported()) return set({ deviceProblem: { kind: 'audio', problem: 'unsupported' } })
      set({ deviceProblem: null })
    }
    await e.setMic(on)
  },
  setCamera: async (on) => {
    const e = engine
    if (!e || !inCall(get().connection)) return
    if (on) {
      if (!get().myPermissions?.canVideo || get().discussion?.videoAllowed === false) return
      if (!mediaSupported()) return set({ deviceProblem: { kind: 'video', problem: 'unsupported' } })
      set({ deviceProblem: null })
    }
    await e.setCamera(on)
  },
  startAudio: async () => {
    await engine?.startAudio()
  },
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  enableDiscussion: (videoAllowed, speaking) =>
    call('EnableDiscussion', videoAllowed, speaking ?? get().discussion?.speaking ?? 'hand'),
  disableDiscussion: () => call('DisableDiscussion'),
  setSpeakingMode: (mode) => call('SetSpeakingMode', mode),
  giveFloor: (memberId) => call('GiveFloor', memberId),
  takeFloor: (memberId) => call('LowerHand', memberId),
  muteMember: (memberId, source) => moderate('MuteMember', [memberId, source], (m) => ({ ...m, [source]: withId(m[source], memberId) })),
  allowMember: (memberId, source) => moderate('AllowMember', [memberId, source], (m) => ({ ...m, [source]: withoutId(m[source], memberId) })),
  muteEveryone: () => call('MuteEveryone'),
  removeFromCall: (memberId) => moderate('RemoveFromCall', [memberId], (m) => ({ ...m, removed: withId(m.removed, memberId) })),
  allowBack: (memberId) => moderate('AllowBack', [memberId], (m) => ({ ...m, removed: withoutId(m.removed, memberId) })),
}))

/** Notices that end your call at once, whatever the call server says next. */
const CALL_ENDED = new Set<string>(['call-ended', 'removed'])
const optionalId = (v: unknown) => (typeof v === 'string' ? v : null)

/** Hooked to the connection the way `bindPresentation` is; `isCurrent` ignores events from a connection that was replaced. */
export function bindStage(connection: Pick<HubConnection, 'on'>, isCurrent: () => boolean) {
  connection.on('Discussion', (d: DiscussionState) => {
    if (!isCurrent()) return
    useStage.setState({ discussion: d })
    if (!d.on) {
      // Ending the call clears the animator's mutes and removals on the server (FR-902): here too.
      useStage.setState({ roster: [], moderation: NO_MODERATION })
      if (useStage.getState().connection !== 'idle') void endCall({ error: null })
    }
  })
  connection.on('CallRoster', (ids: unknown) => {
    if (!isCurrent() || !Array.isArray(ids)) return
    useStage.setState({ roster: ids.filter((x): x is string => typeof x === 'string') })
  })
  connection.on('Hands', (view: HandsView) => {
    if (!isCurrent() || !view || !Array.isArray(view.queue)) return
    useStage.setState({ hands: { queue: view.queue, floor: view.floor ?? null } })
  })
  connection.on('CallNotice', (kind: unknown, byMemberId?: unknown, subjectMemberId?: unknown) => {
    if (!isCurrent() || typeof kind !== 'string' || !NOTICE_KINDS.has(kind)) return
    if (CALL_ENDED.has(kind) && useStage.getState().connection !== 'idle') void endCall({ error: null })
    announce(kind as CallNoticeKind, optionalId(byMemberId), optionalId(subjectMemberId))
  })
}

/** Leaves everything behind: used when the room closes or the circle changes. */
export function resetStage() {
  void endCall({ error: null })
  circleId = null
  deps = defaults
  useStage.setState({ discussion: null, roster: [], notices: [], hands: null, moderation: NO_MODERATION })
}
