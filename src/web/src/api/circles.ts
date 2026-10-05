import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, refreshCsrf } from './client'
import type { Locale } from '../i18n'
import type { AnyCharacter } from '../components/characters'

export type Role = 'animator' | 'participant'

export interface Member {
  id: string
  role: Role
  name: string
  character: AnyCharacter
  /** Which copy of the character (0–5): people sharing a character differ by their ring (spec 008). */
  ring: number
}

export interface Message {
  id: number
  activityId: string | null
  memberId: string | null
  kind: 'member' | 'ai' | 'system'
  text: string
  at: string
  likes: number
  /** Whether you liked it. */
  liked: boolean
  /** Only ever true in the animator's view: members never receive hidden messages. */
  hidden: boolean
}

/** The live room's switches (spec 008, contracts/hub.md). */
export interface RoomSettings {
  chat: 'open' | 'slow' | 'paused'
  reactions: boolean
  pirikooQuiet: boolean
}

/** Raised hands, oldest first, and who has the floor (member ids; names come from the member list). */
export interface HandsView {
  queue: { memberId: string; raisedAt: string }[]
  floor: string | null
}

export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'violet'

export interface BoardNote {
  id: number
  activityId: string
  column: string
  text: string
  color: NoteColor
  authorId: string
  voters: string[]
}

/** A note on the live canvas (issue #93): x and y are its centre, in canvas pixels. */
export type CanvasColor = NoteColor | 'white'
export type CanvasSize = 's' | 'm' | 'l'
export type CanvasShape = 'square' | 'round'
export type CanvasSticker = 'heart' | 'star' | 'thumbs' | 'laugh' | 'idea'

export interface CanvasNote {
  id: number
  activityId: string
  text: string
  x: number
  y: number
  color: CanvasColor
  size: CanvasSize
  shape: CanvasShape
  sticker: CanvasSticker | null
  authorId: string
}

export interface CircleSummary {
  id: string
  name: string
  joinCode: string | null
  role: Role
  status: 'open' | 'closed'
  createdAt: string
  people: number
}

export interface CircleView {
  id: string
  name: string
  joinCode: string | null
  activities: string[]
  currentActivity: string | null
  status: 'open' | 'closed'
  locale: Locale
  me: Member
  members: Member[]
  messages: Message[]
  notes: BoardNote[]
  canvas: CanvasNote[]
  /** Polls, Q&A and the feedback form of the circle (spec 007, contracts/rest.md). */
  decide: DecideView
  settings: RoomSettings
  hands: HandsView
  /** Reactions per kind in the latest presentation of the circle, for its results (spec 008). */
  reactionTotals?: Partial<Record<'clap' | 'heart' | 'laugh' | 'wow' | 'like' | 'party', number>>
}

export interface ChoiceView {
  id: string
  text: string
}

export interface PollView {
  id: string
  question: string
  options: ChoiceView[]
  multipleChoice: boolean
  resultsLive: boolean
  state: 'draft' | 'open' | 'closed'
  myVote?: string[] | null
}

export interface PollResultsView {
  pollId: string
  votes: number
  options: { id: string; count: number; percent: number; winner: boolean }[]
}

export interface QaQuestionView {
  id: number
  text: string
  /** Absent for anonymous questions, for everyone. */
  author?: { memberId: string; name: string; character: string } | null
  upvotes: number
  state: 'open' | 'answered' | 'hidden'
  answer?: string | null
  createdAt: string
  answeredAt?: string | null
  mine: boolean
  upvotedByMe: boolean
}

export type FormQuestionType = 'rating5' | 'nps' | 'single' | 'multiple' | 'yesno' | 'text'

export interface FormQuestionView {
  id: string
  type: FormQuestionType
  label: string
  required: boolean
  look?: 'stars' | 'smileys' | null
  longText?: boolean | null
  options: ChoiceView[]
}

export interface FormView {
  id: string
  title?: string | null
  questions: FormQuestionView[]
  showNames: boolean
  summaryShared: boolean
  state: 'draft' | 'open' | 'closed'
}

export interface DecideView {
  poll: PollView | null
  /** Only when this member may see them (live, closed, or the animator). */
  pollResults: PollResultsView | null
  pollVotes: number | null
  polls: { id: string; question: string; closedAt: string; results: PollResultsView }[]
  qa: { allowAnonymous: boolean; questions: QaQuestionView[] }
  form: FormView | null
}

export interface JoinInfo {
  circleId: string
  name: string
  animatorName: string
  animatorCharacter: AnyCharacter
  /** Characters with no free ring left. */
  taken: AnyCharacter[]
  full: boolean
  alreadyIn: boolean
  /** How many people use each character and which of its rings (0–5) are free (spec 008). */
  characters: { id: AnyCharacter; used: number; freeRings: number[] }[]
}

export const circlesKey = ['circles'] as const
export const circleKey = (id: string) => ['circle', id] as const

export const useMyCircles = (enabled = true) =>
  useQuery({ queryKey: circlesKey, queryFn: ({ signal }) => api<CircleSummary[]>('/api/circles', { signal }), enabled })

export const useCircle = (id: string) =>
  useQuery({ queryKey: circleKey(id), queryFn: ({ signal }) => api<CircleView>(`/api/circles/${id}`, { signal }), retry: false, staleTime: Infinity })

export function useCreateCircle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; activities: string[]; character: AnyCharacter; locale: Locale }) =>
      api<CircleSummary>('/api/circles', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: circlesKey }),
  })
}

export function useCloseCircle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/circles/${id}/close`, { method: 'POST', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: circlesKey }),
  })
}

export const useJoinInfo = (code: string) =>
  useQuery({ queryKey: ['join', code], queryFn: ({ signal }) => api<JoinInfo>(`/api/join/${encodeURIComponent(code)}`, { signal }), retry: false })

export function useJoin(code: string) {
  return useMutation({
    mutationFn: (body: { name: string; character: AnyCharacter }) =>
      api<{ circleId: string; memberId: string }>(`/api/join/${encodeURIComponent(code)}`, { method: 'POST', body }),
    // A guest has a new identity now: the CSRF token must be bound to it.
    onSuccess: () => refreshCsrf(),
  })
}

/** The shareable link for a join code, on this origin. */
export const joinLink = (code: string) => `${window.location.origin}/join/${code}`
