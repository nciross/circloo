import { useCallback, useSyncExternalStore } from 'react'

/**
 * The single answer to "is landing motion on?" for CSS and JS alike. The landing now always animates (useLandingMotion
 * returns on); motionOn below is the earlier rule (on unless the system reduces motion and nobody opted in), kept and
 * tested in case the decision is revisited. The default always follows the system; the opt-in
 * is remembered in this browser only and never touches the signed-in app. The landing sets it as `data-motion` on
 * `.site`, and the landing styles read that attribute instead of `prefers-reduced-motion`.
 */
export const MOTION_KEY = 'circloo-landing-motion'
const QUERY = '(prefers-reduced-motion: reduce)'

export function systemReduced(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
  } catch {
    return false
  }
}

export function readOptIn(): boolean {
  try {
    return window.localStorage.getItem(MOTION_KEY) === '1'
  } catch {
    return false
  }
}

/** Pure rule: motion runs unless the system reduces it and the visitor has not opted in. */
export function motionOn(reduced: boolean, optedIn: boolean): boolean {
  return !reduced || optedIn
}

// In-memory copy so the choice holds for this visit even when storage is blocked.
let memory: boolean | null = null
const listeners = new Set<() => void>()

const optedIn = () => memory ?? readOptIn()

export function setOptIn(value: boolean) {
  memory = value
  try {
    if (value) window.localStorage.setItem(MOTION_KEY, '1')
    else window.localStorage.removeItem(MOTION_KEY)
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
  listeners.forEach((l) => l())
}

/** Test hook: forget the in-memory choice. */
export function resetMotionMemory() {
  memory = null
  listeners.forEach((l) => l())
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  let mq: MediaQueryList | null = null
  try {
    mq = window.matchMedia(QUERY)
    mq.addEventListener('change', onChange)
  } catch {
    /* no matchMedia: nothing to watch */
  }
  // Another tab changed the choice: what is stored now wins over this tab's in-memory copy.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== MOTION_KEY) return
    memory = null
    onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    mq?.removeEventListener('change', onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** Snapshot as a small integer so useSyncExternalStore compares cheaply: bit 1 system reduced, bit 2 opted in. */
const snapshot = () => (systemReduced() ? 1 : 0) | (optedIn() ? 2 : 0)

export function useLandingMotion() {
  const bits = useSyncExternalStore(subscribe, snapshot, () => 0)
  const reduced = (bits & 1) === 1
  const opted = (bits & 2) === 2
  const toggleOptIn = useCallback(() => setOptIn(!optedIn()), [])
  // The founder's call (#250): the landing animates for every visitor, whatever the system setting. The rule above
  // stays the reference (and is tested); the visitor's way out is the page's Pause control, remembered in the browser.
  return { on: true, reduced, optedIn: opted, toggleOptIn }
}
