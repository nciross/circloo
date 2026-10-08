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

/**
 * The work bar shows the animator's actions inline only from 80rem: the app's 15.5rem sidebar takes part of the
 * screen, so between the room's wide layout (60rem) and 80rem the actions sit in the bar's menu and nothing overflows.
 */
export const ROOMY = '(min-width: 80rem)'
const watchRoomy = (cb: () => void) => {
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(ROOMY) : null
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}
const isRoomy = () => (typeof window.matchMedia === 'function' ? window.matchMedia(ROOMY).matches : true)
export function useRoomy() {
  return useSyncExternalStore(watchRoomy, isRoomy, () => true)
}

/** The sidebar's open state for both layouts: kept per device on wide screens, a sheet size on phones. */
export function useSideState() {
  const wide = useWide()
  const [sideOpen, setSideOpen] = useState(loadSideOpen)
  const [sheet, setSheet] = useState<SheetSize>('half')
  const [tab, setTab] = useState('people')
  // A tab opened from outside its tab list (the rail, the work bar's people strip) takes the focus once it shows.
  const [focusTab, setFocusTab] = useState<string | null>(null)
  const open = wide ? sideOpen : sheet !== 'closed'
  const setOpen = (next: boolean) => {
    if (wide) {
      setSideOpen(next)
      saveSideOpen(next)
    } else setSheet(next ? 'half' : 'closed')
  }
  /** Opens the side area on that tab and moves the focus to it. */
  const openTab = (id: string) => {
    setTab(id)
    if (!open) setOpen(true)
    setFocusTab(id)
  }
  return {
    wide, open, setOpen, sheet, setSheet, tab, setTab, openTab, focusTab,
    focused: () => setFocusTab(null),
    state: wide ? (sideOpen ? 'open' : 'closed') : sheet,
  }
}

/** The tab shown: the picked one, or the first when it is gone (Chat ends with its activity). */
export const activeTab = (tabs: { id: string }[], picked: string) => (tabs.some((x) => x.id === picked) ? picked : (tabs[0]?.id ?? ''))

export type SideState = ReturnType<typeof useSideState>

