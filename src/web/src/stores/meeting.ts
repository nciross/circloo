import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const TIMER_CHOICES = [0, 30, 60, 90] as const
export type TimerChoice = (typeof TIMER_CHOICES)[number]
export const MAX_PEOPLE = 30
export const NAME_MAX = 24

/** Unbiased Fisher–Yates with crypto randomness: nobody can game who goes first. */
export function shuffle<T>(items: readonly T[], random: (max: number) => number = cryptoInt): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = random(i + 1)
    ;[a[i], a[j]] = [a[j] as T, a[i] as T]
  }
  return a
}

function cryptoInt(max: number): number {
  // Rejection sampling keeps the distribution uniform.
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while ((buf[0] ?? 0) >= limit)
  return (buf[0] ?? 0) % max
}

type Phase = 'gathering' | 'round' | 'done'

interface MeetingState {
  names: string[]
  order: string[]
  turn: number
  phase: Phase
  timer: TimerChoice
  /** When the current turn began (epoch ms): the kitchen timer derives from it. */
  turnStartedAt: number
  addName: (raw: string) => boolean
  removeName: (name: string) => void
  setTimer: (t: TimerChoice) => void
  start: () => void
  next: () => void
  reshuffle: () => void
  reset: () => void
}

export const useMeetingStore = create<MeetingState>()(
  persist(
    (set, get) => ({
      names: [],
      order: [],
      turn: 0,
      phase: 'gathering',
      timer: 60,
      turnStartedAt: 0,
      addName: (raw) => {
        const name = raw.trim().slice(0, NAME_MAX)
        const { names } = get()
        if (!name || names.length >= MAX_PEOPLE || names.some((n) => n.toLocaleLowerCase() === name.toLocaleLowerCase())) return false
        set({ names: [...names, name] })
        return true
      },
      removeName: (name) =>
        set((s) => {
          const names = s.names.filter((n) => n !== name)
          const order = s.order.filter((n) => n !== name)
          const turn = Math.min(s.turn, Math.max(0, order.length - 1))
          return { names, order, turn, phase: s.phase === 'round' && order.length === 0 ? 'gathering' : s.phase }
        }),
      setTimer: (timer) => set({ timer }),
      start: () => {
        const { names } = get()
        if (names.length < 2) return
        set({ order: shuffle(names), turn: 0, phase: 'round', turnStartedAt: Date.now() })
      },
      next: () =>
        set((s) => {
          if (s.phase !== 'round') return {}
          return s.turn + 1 >= s.order.length ? { phase: 'done' } : { turn: s.turn + 1, turnStartedAt: Date.now() }
        }),
      reshuffle: () => set((s) => ({ order: shuffle(s.names), turn: 0, phase: s.names.length >= 2 ? 'round' : s.phase, turnStartedAt: Date.now() })),
      reset: () => set({ order: [], turn: 0, phase: 'gathering' }),
    }),
    { name: 'circloo-meeting', storage: createJSONStorage(() => sessionStorage) },
  ),
)
