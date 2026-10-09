import { useSyncExternalStore } from 'react'

/** A phone, or any screen too small for nine tiles (a phone on its side too): four tiles a page. */
export const COMPACT = '(max-width: 39.99rem), (max-height: 29.99rem)'
const watch = (cb: () => void) => {
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT) : null
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}
const isCompact = () => (typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT).matches : false)
export const useCompact = () => useSyncExternalStore(watch, isCompact, () => false)
