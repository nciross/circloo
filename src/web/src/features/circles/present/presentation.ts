import { create } from 'zustand'
import type { HubConnection } from '@microsoft/signalr'

/** One answer choice as everyone sees it (contracts/hub.md). */
export interface OptionView {
  id: string
  text: string
}

export type SlideState =
  | { kind: 'deck'; slideId: string; image: string }
  | { kind: 'poll' | 'quiz'; slideId: string; question: string; options: OptionView[]; multipleChoice: boolean; timerSeconds?: number | null; showFirst: boolean; showLive: boolean }

export type Phase = 'idle' | 'answering' | 'locked' | 'revealed' | 'podium'

/** What every screen in the circle renders (contracts/hub.md `PresentationState`). */
export interface PresentationState {
  sessionId: string
  presentationName: string
  position: number
  count: number
  blank: boolean
  slide: SlideState
  phase: Phase
  openedAt?: string | null
  deadline?: string | null
  serverNow: string
  /** Grows with every change of the session: an older state arriving late is ignored. */
  version: number
}

/** The animator's private view: the current slide's notes and the next slide. */
export interface PresenterNotes {
  slideId: string
  notes: string | null
  upcoming: { slideId: string; kind: SlideState['kind']; image: string | null; question: string | null } | null
}

interface PresentationStore {
  state: PresentationState | null
  notes: PresenterNotes | null
  /** When the state arrived, to judge freshness on screens that measure it (e2e, SC-603). */
  receivedAt: number
  reset: () => void
}

/** The running presentation in the circle you are in, fed by hub events (spec 006 US3). */
export const useLive = create<PresentationStore>()((set) => ({
  state: null,
  notes: null,
  receivedAt: 0,
  reset: () => set({ state: null, notes: null, receivedAt: 0 }),
}))

/** Sessions that ended while this page was open: a state about one of them arriving late never brings it back. */
const ended = new Set<string>()

/** Whether an incoming state should replace the one shown (contracts/hub.md: versions only grow). */
export function isNewer(incoming: PresentationState, shown: PresentationState | null): boolean {
  if (ended.has(incoming.sessionId)) return false
  return !shown || shown.sessionId !== incoming.sessionId || incoming.version >= shown.version
}

/**
 * Applies a state from the server, unless it is older than the one shown. `null` is the server saying nothing is
 * presented (an answer to entering again after a reconnect): whatever was shown is gone.
 */
export function receive(state: PresentationState | null) {
  if (!state) {
    useLive.getState().reset()
    return
  }
  if (isNewer(state, useLive.getState().state)) useLive.setState({ state, receivedAt: Date.now() })
}

/**
 * Wires a hub connection (the room's, or the audience screen's) to the store. `isCurrent` drops events from a
 * connection that is being replaced (stopping is asynchronous), so a late event never lands in the next circle.
 */
export function bindPresentation(connection: HubConnection, isCurrent: () => boolean = () => true) {
  connection.on('PresentationState', (state: PresentationState) => {
    if (isCurrent()) receive(state)
  })
  connection.on('PresenterNotes', (slideId: string, notes: string | null, upcoming: PresenterNotes['upcoming']) => {
    if (isCurrent()) useLive.setState({ notes: { slideId, notes, upcoming } })
  })
  connection.on('PresentationEnded', (sessionId: string) => {
    ended.add(sessionId)
    if (isCurrent() && useLive.getState().state?.sessionId === sessionId) useLive.getState().reset()
  })
}

/** Warms the browser cache with a slide picture so the next move shows at once. */
export function prefetch(src: string | null | undefined) {
  if (!src) return
  const img = new Image()
  img.decoding = 'async'
  img.src = src
}
