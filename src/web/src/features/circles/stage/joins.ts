/**
 * Who joined or left the call, said once and grouped (spec 009 US7 #2, FR-925): a burst of arrivals is one polite
 * sentence a moment later, never one interruption per person. The first list after you join is where you start, not news.
 */
import { useEffect, useRef, useState } from 'react'
import type { TFunction } from 'i18next'

export interface JoinChanges {
  joined: string[]
  left: string[]
}

/** The ids that arrived and went between two lists of the call. */
export function diffPeople(before: readonly string[], after: readonly string[]): JoinChanges {
  const was = new Set(before)
  const now = new Set(after)
  return { joined: after.filter((id) => !was.has(id)), left: before.filter((id) => !now.has(id)) }
}

/** One sentence per direction: a name, two names, or a count. */
export function joinsText(t: TFunction, names: { joined: string[]; left: string[] }): string {
  const part = (list: string[], key: 'joined' | 'left') =>
    list.length === 0 ? null
      : list.length === 1 ? t(`circles.call.${key}.one`, { name: list[0] })
        : list.length === 2 ? t(`circles.call.${key}.two`, { a: list[0], b: list[1] })
          : t(`circles.call.${key}.group`, { count: list.length })
  return [part(names.joined, 'joined'), part(names.left, 'left')].filter(Boolean).join(' ')
}

/** How long arrivals are gathered before one sentence is said. */
export const JOINS_WINDOW = 1500

/**
 * The sentence for a polite live region. `ids` is the call's people without you; `nameOf` turns an id into a name.
 * Someone who joins and leaves inside the same window is not mentioned at all.
 */
export function useJoinsAnnouncement(ids: readonly string[], nameOf: (id: string) => string, t: TFunction): string {
  const [text, setText] = useState('')
  const base = useRef<readonly string[] | null>(null)
  const pending = useRef<{ from: readonly string[]; timer: number } | null>(null)
  const latest = useRef({ ids, nameOf, t })
  const key = [...ids].sort().join(' ')

  // The newest list and names, for the timer that fires later; updated before the effect below reads them.
  useEffect(() => {
    latest.current = { ids, nameOf, t }
  })
  useEffect(() => {
    if (base.current === null) {
      base.current = latest.current.ids
      return
    }
    if (pending.current) return
    const from = base.current
    const timer = window.setTimeout(() => {
      const now = latest.current
      const change = diffPeople(from, now.ids)
      base.current = now.ids
      pending.current = null
      if (change.joined.length || change.left.length) {
        setText(joinsText(now.t, { joined: change.joined.map(now.nameOf), left: change.left.map(now.nameOf) }))
      }
    }, JOINS_WINDOW)
    pending.current = { from, timer }
  }, [key])

  useEffect(() => () => window.clearTimeout(pending.current?.timer), [])
  return text
}
