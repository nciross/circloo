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

export type QuestionSlide = Extract<SlideState, { kind: 'poll' | 'quiz' }>

export type Phase = 'idle' | 'answering' | 'locked' | 'revealed' | 'podium'

/** A question's results (contracts/hub.md `Results`): live for polls that show them, otherwise at the reveal. */
export interface Results {
  total: number
  options: { id: string; count: number; percent: number; winner: boolean; correct?: boolean | null }[]
}

/** "n of N answered" and who is still to answer: the animator and the audience screen only. */
export interface AnswerCount {
  slideId: string
  answered: number
  of: number
  pending: string[]
}

/** Your own answer to a question, on every tab and device you use. */
export interface MyAnswer {
  slideId: string
  options: string[]
}

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
  results?: Results | null
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
  /** Server time minus this device's time (ms), so countdowns follow the server's deadline, not a wrong phone clock. */
  skew: number
  count: AnswerCount | null
  /** Your answers by question, as the server confirmed them. */
  mine: Record<string, string[]>
  reset: () => void
}

/** The running presentation in the circle you are in, fed by hub events (spec 006 US3). */
export const useLive = create<PresentationStore>()((set) => ({
  state: null,
  notes: null,
  receivedAt: 0,
  skew: 0,
  count: null,
  mine: {},
  reset: () => set({ state: null, notes: null, receivedAt: 0, skew: 0, count: null, mine: {} }),
}))

/** This device's clock, corrected to the server's. */
export const serverNow = () => Date.now() + useLive.getState().skew

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
  const shown = useLive.getState().state
  if (!isNewer(state, shown)) return
  const receivedAt = Date.now()
  const skew = Date.parse(state.serverNow) - receivedAt
  // Another session (the same deck presented again reuses its slide ids): answers and counts start over.
  const fresh = shown && shown.sessionId !== state.sessionId ? { mine: {}, count: null } : {}
  useLive.setState({ state, receivedAt, skew: Number.isFinite(skew) ? skew : 0, ...fresh })
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
  connection.on('AnswerCount', (count: AnswerCount) => {
    if (isCurrent()) useLive.setState({ count })
  })
  connection.on('MyAnswer', (answer: MyAnswer) => {
    if (isCurrent()) useLive.setState((s) => ({ mine: { ...s.mine, [answer.slideId]: answer.options } }))
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
