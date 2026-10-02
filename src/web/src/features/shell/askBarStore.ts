import { create } from 'zustand'

interface AskBarState {
  open: boolean
  /** Words to start from, when a suggestion opens the bar with its plan ready to check. */
  initial: string
  show: (initial?: string) => void
  hide: () => void
}

export const useAskBar = create<AskBarState>()((set) => ({
  open: false,
  initial: '',
  show: (initial = '') => set({ open: true, initial }),
  hide: () => set({ open: false }),
}))
