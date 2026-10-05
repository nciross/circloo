import { useState, useSyncExternalStore } from 'react'
import { loadSideOpen, saveSideOpen } from './sidebar'

export const WIDE = '(min-width: 60rem)'
export type SheetSize = 'half' | 'full' | 'closed'

const watchWide = (cb: () => void) => {
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}
const isWide = () => (typeof window.matchMedia === 'function' ? window.matchMedia(WIDE).matches : true)

/** True from 960 px up (the sidebar), false below (the bottom sheet). */
export function useWide() {
  return useSyncExternalStore(watchWide, isWide, () => true)
}

/** The sidebar's open state for both layouts: kept per device on wide screens, a sheet size on phones. */
export function useSideState() {
  const wide = useWide()
  const [sideOpen, setSideOpen] = useState(loadSideOpen)
  const [sheet, setSheet] = useState<SheetSize>('half')
  const [tab, setTab] = useState('people')
  const open = wide ? sideOpen : sheet !== 'closed'
  const setOpen = (next: boolean) => {
    if (wide) {
      setSideOpen(next)
      saveSideOpen(next)
    } else setSheet(next ? 'half' : 'closed')
  }
  return { wide, open, setOpen, sheet, setSheet, tab, setTab, state: wide ? (sideOpen ? 'open' : 'closed') : sheet }
}

/** The tab shown: the picked one, or the first when it is gone (Chat ends with its activity). */
export const activeTab = (tabs: { id: string }[], picked: string) => (tabs.some((x) => x.id === picked) ? picked : (tabs[0]?.id ?? ''))

export type SideState = ReturnType<typeof useSideState>

