import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Step } from '../lib/intent'
import { askPirikoo, PirikooError, type PirikooAsk, type PirikooFailure, type PirikooTurn } from '../api/pirikoo'

export type ChatMode = 'closed' | 'panel' | 'center'
/** What the bird shows: the same states drive the corner button and the avatar in the conversation. */
export type Mood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'oops'

export interface ChatItem {
  id: string
  role: 'user' | 'pirikoo'
  text: string
  /** Pirikoo's messages: waiting for the first word, streaming, done, stopped by the person, or failed. */
  state?: 'waiting' | 'streaming' | 'done' | 'stopped' | 'error'
  error?: PirikooFailure
  /** The server swapped an unsafe answer for a kind line. */
  replaced?: boolean
  /** Steps Pirikoo offers to run; nothing runs until the person says so. */
  plan?: Step[]
  ran?: boolean
}

export type AskContext = Omit<PirikooAsk, 'message' | 'history'>

interface PirikooState {
  /** Whose conversation this is (an account or a circle guest); a different person starts fresh. */
  owner: string | null
  items: ChatItem[]
  mode: ChatMode
  busy: boolean
  /** An answer arrived while the conversation was closed. */
  unread: boolean
  /** The person is writing to Pirikoo. */
  listening: boolean
  flash: 'happy' | 'oops' | null
  /** What the person is writing, kept while the chat switches between the corner and the centre. */
  draft: string
  setDraft: (draft: string) => void
  bind: (owner: string) => void
  open: (mode: 'panel' | 'center') => void
  close: () => void
  setListening: (listening: boolean) => void
  /** Asks Pirikoo, or with `local` only proposes the plan without calling the server. */
  ask: (text: string, context: AskContext, plan: Step[], local: boolean) => Promise<void>
  stop: () => void
  clear: () => void
  remove: (ids: string[]) => void
  markRan: (id: string) => void
  /** A little hop to draw the eye, when a suggestion appears. */
  cheer: () => void
}

export const MAX_ITEMS = 40
const HISTORY_TURNS = 12
const TURN_MAX = 1500

let current: AbortController | null = null
let flashTimer = 0
/** Where focus goes back when the conversation closes: whatever opened it, else the corner button. */
let returnFocus: HTMLElement | null = null

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** The earlier turns the server needs to follow the conversation (it keeps none itself). */
export function historyOf(items: ChatItem[]): PirikooTurn[] {
  return items
    .filter((i) => i.text.trim() && (i.role === 'user' || (i.state === 'done' && !i.replaced)))
    .slice(-HISTORY_TURNS)
    .map((i) => ({ role: i.role, text: i.text.trim().slice(0, TURN_MAX) }))
}

// Without session storage (blocked site data) the conversation simply lives until the page closes.
const tabStorage = createJSONStorage(() => sessionStorage)

export const usePirikoo = create<PirikooState>()(
  persist(
    (set, get) => {
      const flash = (kind: 'happy' | 'oops') => {
        window.clearTimeout(flashTimer)
        set({ flash: kind })
        flashTimer = window.setTimeout(() => set({ flash: null }), 1400)
      }
      const patch = (id: string, change: (i: ChatItem) => Partial<ChatItem>) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...change(i) } : i)) }))

      return {
        owner: null,
        items: [],
        mode: 'closed',
        busy: false,
        unread: false,
        listening: false,
        flash: null,
        draft: '',
        setDraft: (draft) => set({ draft }),
        bind: (owner) => {
          if (get().owner === owner) return
          current?.abort()
          set({ owner, items: [], busy: false, unread: false, draft: '' })
        },
        open: (mode) => {
          if (get().mode === 'closed' && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
            returnFocus = document.activeElement
          }
          set({ mode, unread: false })
        },
        close: () => {
          set({ mode: 'closed', listening: false })
          const back = returnFocus
          returnFocus = null
          requestAnimationFrame(() => (back?.isConnected ? back : document.querySelector<HTMLElement>('.pkl__button'))?.focus())
        },
        setListening: (listening) => {
          if (get().listening !== listening) set({ listening })
        },
        ask: async (text, context, plan, local) => {
          if (get().busy) return
          const question: ChatItem = { id: uid(), role: 'user', text }
          if (local) {
            const offer: ChatItem = { id: uid(), role: 'pirikoo', text: '', state: 'done', plan }
            set((s) => ({ items: [...s.items, question, offer].slice(-MAX_ITEMS) }))
            flash('happy')
            return
          }
          const history = historyOf(get().items)
          const reply: ChatItem = { id: uid(), role: 'pirikoo', text: '', state: 'waiting' }
          set((s) => ({ items: [...s.items, question, reply].slice(-MAX_ITEMS), busy: true }))
          const controller = new AbortController()
          current = controller
          try {
            const answer = await askPirikoo({ ...context, message: text, history }, (piece) =>
              patch(reply.id, (i) => ({ text: i.text + piece, state: 'streaming' })), controller.signal)
            patch(reply.id, () => ({ text: answer.text, state: 'done', replaced: answer.replaced, plan: plan.length ? plan : undefined }))
            flash('happy')
            if (get().mode === 'closed') set({ unread: true })
          } catch (e) {
            if (controller.signal.aborted) {
              patch(reply.id, (i) => ({ state: i.text ? 'stopped' : 'error', error: i.text ? undefined : 'failed' }))
            } else {
              patch(reply.id, () => ({ text: '', state: 'error', error: e instanceof PirikooError ? e.code : 'failed' }))
              flash('oops')
            }
          } finally {
            if (current === controller) current = null
            set({ busy: false })
          }
        },
        stop: () => current?.abort(),
        clear: () => {
          current?.abort()
          set({ items: [], unread: false })
        },
        remove: (ids) => set((s) => ({ items: s.items.filter((i) => !ids.includes(i.id)) })),
        markRan: (id) => patch(id, () => ({ ran: true })),
        cheer: () => {
          if (!get().busy) flash('happy')
        },
      }
    },
    {
      name: 'circloo-pirikoo',
      storage: tabStorage,
      // Only this tab keeps the conversation; an answer cut by a reload shows as stopped.
      partialize: (s) => ({ owner: s.owner, items: s.items }),
      merge: (persisted, state) => {
        const p = (persisted ?? {}) as Partial<PirikooState>
        const items = (p.items ?? []).map((i) => (i.state === 'waiting' || i.state === 'streaming' ? { ...i, state: i.text ? 'stopped' as const : 'error' as const, error: i.text ? undefined : 'failed' as const } : i))
        return { ...state, owner: p.owner ?? null, items }
      },
    },
  ),
)

/** The bird's state, from what the conversation is doing. */
export function moodOf(s: Pick<PirikooState, 'busy' | 'items' | 'flash' | 'listening'>): Mood {
  if (s.busy) return s.items.at(-1)?.state === 'streaming' ? 'speaking' : 'thinking'
  if (s.flash) return s.flash
  return s.listening ? 'listening' : 'idle'
}

/** Signing out forgets the conversation in this tab too. */
export function forgetPirikoo() {
  current?.abort()
  usePirikoo.setState({ owner: null, items: [], mode: 'closed', unread: false, draft: '' })
  try {
    sessionStorage.removeItem('circloo-pirikoo')
  } catch {
    // Nothing stored.
  }
}
