/**
 * Store and hub bindings of the live discussion stage (spec 009, contracts/hub.md).
 *
 * The store talks to the hub only through the injected `invoke` (see `configureStage`), so it can be tested with a
 * fake hub and does not call hub methods before the room wires it up (T906). Nobody asks for a camera or a microphone
 * until a device action runs, and everyone joins the stage muted with the camera off.
 */
import { create } from 'zustand'
import type { HubConnection } from '@microsoft/signalr'
import { fetchIce, type IceConfig, type Seat, type SignalKind, type StageNoticeKind, type StageView } from '../../../api/discussion'
import type { DiscussionState, RecordingState } from '../../../api/circles'
import { mediaSupported, openMedia, type MediaProblem, type OpenedMedia } from './media'
import { MeshManager, type MeshMode } from './mesh'
import type { LinkState, Receiving } from './link'

export interface MyMedia {
  audioOn: boolean
  videoOn: boolean
  /** Why a device did not start; the UI explains it (T907). A working microphone with a failed camera is audio only. */
  problem: MediaProblem | null
}

export interface Announcement {
  id: number
  kind: StageNoticeKind
  byMemberId: string | null
}

export interface LinkInfo {
  memberId: string
  state: LinkState
  receiving: Receiving
}

interface StageState {
  discussion: DiscussionState | null
  seats: Seat[]
  watching: number
  recording: RecordingState | null
  /** Seconds left before the recording cap, from the animator's warning. */
  recordingWarning: number | null
  mode: MeshMode
  myMedia: MyMedia
  links: LinkInfo[]
  announcements: Announcement[]
  joinStage: () => Promise<void>
  leaveStage: () => Promise<void>
  watchStage: () => Promise<void>
  stopWatching: () => Promise<void>
  /** Turns the microphone and camera on or off. Asking for a device happens here and only here. */
  setMedia: (audio: boolean, video: boolean) => Promise<void>
  /** After a dropped connection: take the seat again and report the devices. */
  rejoin: () => Promise<void>
  dismissAnnouncement: (id: number) => void
  enableDiscussion: (videoAllowed: boolean) => Promise<void>
  disableDiscussion: () => Promise<void>
  giveFloor: (memberId: string) => Promise<void>
  takeFloor: (memberId: string) => Promise<void>
  removeFromStage: (memberId: string) => Promise<void>
  muteMember: (memberId: string) => Promise<void>
  allowUnmute: (memberId: string) => Promise<void>
}

export interface StageDeps {
  invoke: (method: string, ...args: unknown[]) => Promise<void>
  fetchIce: (circleId: string) => Promise<IceConfig>
  createPeer: (config: RTCConfiguration) => RTCPeerConnection
  openMedia: (want: { audio: boolean; video: boolean }) => Promise<OpenedMedia>
}

const offline = () => Promise.reject(new Error('offline'))
const defaults: StageDeps = {
  // Not wired to the room's hub yet: T906 passes the room's `invoke` through configureStage.
  invoke: offline,
  fetchIce,
  createPeer: (c) => new RTCPeerConnection(c),
  openMedia,
}

let deps: StageDeps = defaults
let who: { circleId: string; selfId: string } | null = null
let mesh: MeshManager | null = null
let noticeId = 0
const MAX_ANNOUNCEMENTS = 20
const NO_MEDIA: MyMedia = { audioOn: false, videoOn: false, problem: null }

/** Says which circle and who you are, and how to reach the hub. Call it when the room is entered. */
export function configureStage(c: { circleId: string; selfId: string; deps?: Partial<StageDeps> }) {
  teardown()
  who = { circleId: c.circleId, selfId: c.selfId }
  deps = { ...defaults, ...c.deps }
}

function ensureMesh(): MeshManager {
  if (!who) throw new Error('not-configured')
  const { circleId, selfId } = who
  mesh ??= new MeshManager({
    selfId,
    createPeer: (c) => deps.createPeer(c),
    getIce: () => deps.fetchIce(circleId),
    // A refused signal (limits, unknown seat) only means that link does not come up; never an error for the person.
    send: (to, kind, linkId, payload) => void deps.invoke('Signal', to, kind, linkId, payload).catch(() => undefined),
    limits: () => {
      const d = useStage.getState().discussion
      return { stageMax: d?.stageMax ?? 8, listenersMax: d?.listenersMax ?? 8 }
    },
    onChange: () => useStage.setState({ links: mesh?.snapshot() ?? [] }),
  })
  return mesh
}

/** Local teardown: links closed, camera and microphone stopped, nothing left running. */
function teardown() {
  mesh?.close()
  mesh = null
  useStage.setState({ mode: 'none', myMedia: NO_MEDIA, links: [] })
}

function announce(kind: StageNoticeKind, byMemberId: string | null) {
  useStage.setState((s) => ({ announcements: [...s.announcements, { id: ++noticeId, kind, byMemberId }].slice(-MAX_ANNOUNCEMENTS) }))
}

const call = (method: string, ...args: unknown[]) => deps.invoke(method, ...args)

export const useStage = create<StageState>()((set, get) => ({
  discussion: null,
  seats: [],
  watching: 0,
  recording: null,
  recordingWarning: null,
  mode: 'none',
  myMedia: NO_MEDIA,
  links: [],
  announcements: [],
  joinStage: async () => {
    const m = ensureMesh()
    // Fresh ICE servers first (client behaviour in the contract); no media is requested here.
    await m.warmIce()
    await call('JoinStage')
    m.setMode('stage')
    set({ mode: 'stage', myMedia: NO_MEDIA })
    m.apply({ seats: get().seats, watching: get().watching })
  },
  leaveStage: async () => {
    try {
      await call('LeaveStage')
    } finally {
      teardown()
    }
  },
  watchStage: async () => {
    const m = ensureMesh()
    await m.warmIce()
    await call('WatchStage')
    m.setMode('viewer')
    set({ mode: 'viewer', myMedia: NO_MEDIA })
    m.apply({ seats: get().seats, watching: get().watching })
  },
  stopWatching: async () => {
    try {
      await call('StopWatching')
    } finally {
      teardown()
    }
  },
  setMedia: async (audio, video) => {
    const m = mesh
    if (!m || get().mode !== 'stage') return
    const before = get().myMedia
    const allowVideo = video && (get().discussion?.videoAllowed ?? false)
    let problem: MediaProblem | null = null
    if ((audio && !before.audioOn) || (allowVideo && !before.videoOn)) {
      const opened = await deps.openMedia({ audio: audio && !before.audioOn, video: allowVideo && !before.videoOn })
      problem = opened.problem
      if (opened.audio) m.setLocalTrack('audio', opened.audio)
      if (opened.video) m.setLocalTrack('video', opened.video)
    }
    if (!audio) m.setLocalTrack('audio', null)
    if (!video) m.setLocalTrack('video', null)
    const next: MyMedia = {
      audioOn: audio && (before.audioOn || m.hasTrack('audio')),
      videoOn: allowVideo && (before.videoOn || m.hasTrack('video')),
      problem,
    }
    set({ myMedia: next })
    try {
      await call('SetMedia', next.audioOn, next.videoOn)
    } catch (e) {
      // The server refused (muted by the animator, cameras off): nothing stays on.
      m.setLocalTrack('audio', null)
      m.setLocalTrack('video', null)
      set({ myMedia: NO_MEDIA })
      throw e
    }
  },
  rejoin: async () => {
    const { mode, myMedia } = get()
    if (mode === 'none' || !mesh) return
    mesh.reset()
    try {
      await call(mode === 'stage' ? 'JoinStage' : 'WatchStage')
      if (mode === 'stage') await call('SetMedia', myMedia.audioOn, myMedia.videoOn)
    } catch {
      teardown()
      return
    }
    // Local tracks are still live; the next Stage view (pushed on Enter) opens the links again.
    mesh.apply({ seats: get().seats, watching: get().watching })
  },
  dismissAnnouncement: (id) => set((s) => ({ announcements: s.announcements.filter((a) => a.id !== id) })),
  enableDiscussion: (videoAllowed) => call('EnableDiscussion', videoAllowed),
  disableDiscussion: () => call('DisableDiscussion'),
  giveFloor: (memberId) => call('GiveFloor', memberId),
  takeFloor: (memberId) => call('TakeFloor', memberId),
  removeFromStage: (memberId) => call('RemoveFromStage', memberId),
  muteMember: (memberId) => call('MuteMember', memberId),
  allowUnmute: (memberId) => call('AllowUnmute', memberId),
}))

/** What the browser needs before anyone can join (R14). */
export const stageSupported = mediaSupported

/** Notices that end your seat: the media stops at once, whatever the Stage view says next. */
const SEAT_ENDED = new Set<StageNoticeKind>(['removed', 'floor-taken', 'seat-moved', 'seat-lost', 'discussion-ended'])

/** Hooked to the connection the way `bindPresentation` is; `isCurrent` ignores events from a connection that was replaced. */
export function bindStage(connection: Pick<HubConnection, 'on'>, isCurrent: () => boolean) {
  connection.on('Discussion', (d: DiscussionState) => {
    if (!isCurrent()) return
    useStage.setState({ discussion: d })
    if (!d.on && useStage.getState().mode !== 'none') teardown()
  })
  connection.on('Stage', (view: StageView) => {
    if (!isCurrent()) return
    useStage.setState({ seats: view.seats, watching: view.watching })
    mesh?.apply(view)
  })
  connection.on('StageNotice', (kind: StageNoticeKind, byMemberId?: string | null) => {
    if (!isCurrent()) return
    if (SEAT_ENDED.has(kind) && useStage.getState().mode !== 'none') teardown()
    // The server already switched the microphone off; the device follows.
    if (kind === 'muted' && mesh) {
      mesh.setLocalTrack('audio', null)
      useStage.setState((s) => ({ myMedia: { ...s.myMedia, audioOn: false } }))
    }
    announce(kind, byMemberId ?? null)
  })
  connection.on('Recording', (r: RecordingState | null) => {
    if (isCurrent()) useStage.setState({ recording: r, recordingWarning: null })
  })
  connection.on('RecordingWarning', (secondsLeft: number) => {
    if (isCurrent()) useStage.setState({ recordingWarning: secondsLeft })
  })
  connection.on('Signal', (fromMemberId: string, kind: SignalKind, linkId: string, payload: string) => {
    if (isCurrent()) void mesh?.receive(fromMemberId, kind, linkId, payload)
  })
}

/** Leaves everything behind: used when the room closes or the circle changes. */
export function resetStage() {
  teardown()
  who = null
  deps = defaults
  useStage.setState({ discussion: null, seats: [], watching: 0, recording: null, recordingWarning: null, announcements: [] })
}
