import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Audience, Kind, Spark, Tone } from '../api/sparks'

interface DeckState {
  audience: Audience
  tone: Tone
  kind: Kind
  kidsSafe: boolean
  /** Ids already dealt for the current filters: the deck never repeats until the pool is exhausted (FR-102). */
  seen: string[]
  /** Bumped by "shake": part of the draw query key, so each shake deals a new card. */
  deal: number
  /** A card put on the board from outside the deck (kept AI card, a keeper). */
  pinned: Spark | null
  /** A theme the Ask bar plan wants fresh AI cards about; the ask panel picks it up once. */
  pendingAsk: string | null
  setFilter: (patch: Partial<Pick<DeckState, 'audience' | 'tone' | 'kind' | 'kidsSafe'>>) => void
  shake: () => void
  dealt: (spark: Spark | null, exhausted: boolean) => void
  pin: (spark: Spark) => void
  requestAsk: (theme: string | null) => void
}

export const useDeckStore = create<DeckState>()(
  persist(
    (set) => ({
      audience: 'friends',
      tone: 'silly',
      kind: 'icebreaker',
      kidsSafe: false,
      seen: [],
      deal: 0,
      pinned: null,
      pendingAsk: null,
      // Changing a filter starts a fresh deck.
      setFilter: (patch) =>
        set((s) => {
          const changed = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => patch[k] !== s[k])
          return changed ? { ...patch, seen: [], pinned: null } : {}
        }),
      shake: () => set((s) => ({ deal: s.deal + 1, pinned: null })),
      dealt: (spark, exhausted) => set((s) => ({ seen: spark ? [...(exhausted ? [] : s.seen), spark.id] : s.seen })),
      pin: (spark) => set({ pinned: spark }),
      requestAsk: (theme) => set({ pendingAsk: theme }),
    }),
    {
      name: 'circloo-deck',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ audience: s.audience, tone: s.tone, kind: s.kind, kidsSafe: s.kidsSafe }),
    },
  ),
)
