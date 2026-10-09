import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '../../../api/circles'
import { useRoom } from '../room'
import { CHAT_EVERY, announceDelay, batchSay, worthSaying } from './grouping'

/**
 * What screen readers hear about the chat (spec 008 US3 #8, SC-809): new messages from others, politely and in batches.
 * One message is read with its sender ("Kenji: bravo"), a burst as a count ("3 new messages"), at most one sentence
 * every few seconds, the same rhythm as the hands. Messages already there when the chat opens, or when the room loads
 * another circle, are never read out; a message hidden before its turn is skipped. The line is emptied between
 * announcements, so the same words are heard again.
 */
export function useChatAnnouncement(shown: Message[]): string {
  const { t } = useTranslation()
  const circleId = useRoom((s) => s.circleId)
  const meId = useRoom((s) => s.me?.id)
  const [said, setSaid] = useState('')
  const known = useRef<{ circle: string | null; ids: Set<number> } | null>(null)
  const pending = useRef<number[]>([])
  const latest = useRef(shown)
  const lastSaid = useRef(0)
  const sayTimer = useRef<number | undefined>(undefined)
  const clearTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    latest.current = shown
    // A first look, or another circle: what is there now is history.
    if (!known.current || known.current.circle !== circleId) {
      known.current = { circle: circleId, ids: new Set(shown.map((m) => m.id)) }
      pending.current = []
      return
    }
    const ids = known.current.ids
    for (const m of shown) {
      if (ids.has(m.id)) continue
      ids.add(m.id)
      if (worthSaying(m, meId)) pending.current.push(m.id)
    }
    if (pending.current.length === 0 || sayTimer.current !== undefined) return
    sayTimer.current = window.setTimeout(() => {
      sayTimer.current = undefined
      const batch = latest.current.filter((m) => pending.current.includes(m.id) && !m.hidden)
      pending.current = []
      const say = batchSay(batch, useRoom.getState().members)
      const text =
        say.kind === 'one' ? t('circles.chat.say.one', { name: say.name, text: say.text })
        : say.kind === 'many' ? t('circles.chat.say.many', { count: say.count })
        : ''
      if (!text) return
      lastSaid.current = Date.now()
      setSaid(text)
      window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(() => setSaid(''), CHAT_EVERY - 500)
    }, announceDelay(lastSaid.current, Date.now()))
  }, [shown, circleId, meId, t])

  useEffect(
    () => () => {
      window.clearTimeout(sayTimer.current)
      window.clearTimeout(clearTimer.current)
      sayTimer.current = undefined
    },
    [],
  )

  return said
}
