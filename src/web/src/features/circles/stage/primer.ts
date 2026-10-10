import type { MediaKind } from './media'

/**
 * The permission primer of spec 009 (FR-910, T907): one sentence in the page before the browser asks for a device. It
 * shows once per device kind in a browser session, and only when a browser prompt can follow: a permission the browser
 * already granted or refused asks nothing, so there is nothing to explain first.
 */
const KEY = 'circloo.call.primed'
/** Kept here too, for browsers that refuse session storage. */
const seen = new Set<MediaKind>()

function stored(): MediaKind[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((k): k is MediaKind => k === 'audio' || k === 'video') : []
  } catch {
    return []
  }
}

export function primed(kind: MediaKind): boolean {
  return seen.has(kind) || stored().includes(kind)
}

export function markPrimed(kind: MediaKind) {
  seen.add(kind)
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...new Set([...stored(), kind])]))
  } catch {
    // Remembered for this page only.
  }
}

/** For tests: forget every primer seen. */
export function resetPrimer() {
  seen.clear()
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
}

/** What the browser will do on the next request: ask, or answer by itself. Unknown when it cannot say (or is slow). */
export async function permissionState(kind: MediaKind): Promise<PermissionState | 'unknown'> {
  const query = typeof navigator === 'undefined' ? undefined : navigator.permissions?.query
  if (!query) return 'unknown'
  const name = (kind === 'audio' ? 'microphone' : 'camera') as PermissionName
  try {
    const answer = navigator.permissions.query({ name }).then((s) => s.state)
    const slow = new Promise<'unknown'>((resolve) => setTimeout(() => resolve('unknown'), 500))
    return await Promise.race([answer, slow])
  } catch {
    // Firefox before 131 and older Safari do not know these names.
    return 'unknown'
  }
}

export async function needsPrimer(kind: MediaKind): Promise<boolean> {
  if (primed(kind)) return false
  const state = await permissionState(kind)
  return state === 'prompt' || state === 'unknown'
}
