import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRoom } from '../room'
import { HANDS_EVERY, HANDS_GATHER, NAMES_MAX, listNames, myHand, newlyRaised, sameHand, type MyHand } from './hands'

/**
 * What screen readers hear about hands (spec 008 US5 #6). The animator hears each hand that goes up ("Amina raised a
 * hand"), grouped when several go up together, never one line per hand in a burst. A participant hears their own place
 * when it changes ("You are 2nd", "You have the floor", "Your hand is down"). Hands already up when the room opens are
 * not read out. At most one sentence every few seconds; the line is emptied between, so the same words are heard again.
 */
export function useHandsAnnouncement(): string {
  const { t, i18n } = useTranslation()
  const hands = useRoom((s) => s.hands)
  const me = useRoom((s) => s.me)
  const isAnimator = me?.role === 'animator'
  const meId = me?.id
  const [said, setSaid] = useState('')
  const before = useRef(hands)
  const latest = useRef(hands)
  const raised = useRef<string[]>([])
  const told = useRef<MyHand>(myHand(hands, meId))
  const lastSaid = useRef(0)
  const sayTimer = useRef<number | undefined>(undefined)
  const clearTimer = useRef<number | undefined>(undefined)

  // Another person on this page (a new circle loaded): start from their current place, silently.
  useEffect(() => {
    told.current = myHand(latest.current, meId)
    raised.current = []
  }, [meId])

  useEffect(() => {
    latest.current = hands
    if (before.current === hands) return
    if (isAnimator) raised.current.push(...newlyRaised(before.current, hands).filter((id) => !raised.current.includes(id)))
    before.current = hands
    const pending = isAnimator ? raised.current.length > 0 : !sameHand(myHand(hands, meId), told.current)
    if (!pending || sayTimer.current !== undefined) return
    const wait = Math.max(HANDS_GATHER, lastSaid.current + HANDS_EVERY - Date.now())
    sayTimer.current = window.setTimeout(() => {
      sayTimer.current = undefined
      const now = latest.current
      let text = ''
      if (isAnimator) {
        // Someone who raised and lowered within the wait is not announced.
        const members = useRoom.getState().members
        const ids = raised.current.filter((id) => now.queue.some((h) => h.memberId === id))
        raised.current = []
        const names = ids.flatMap((id) => members.find((m) => m.id === id)?.name ?? [])
        if (names.length === 1) text = t('circles.hands.say.raisedOne', { name: names[0] })
        else if (names.length > 1 && names.length <= NAMES_MAX) text = t('circles.hands.say.raisedMany', { names: listNames(names, i18n.language) })
        else if (names.length > NAMES_MAX) text = t('circles.hands.say.raisedCount', { count: names.length })
      } else {
        const mine = myHand(now, meId)
        if (!sameHand(mine, told.current)) {
          text =
            mine.kind === 'floor' ? t('circles.hands.youHaveFloor')
            : mine.kind === 'queue' ? t('circles.hands.place', { count: mine.place, ordinal: true })
            : t('circles.hands.say.down')
          told.current = mine
        }
      }
      if (!text) return
      lastSaid.current = Date.now()
      setSaid(text)
      window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(() => setSaid(''), HANDS_EVERY - 500)
    }, wait)
  }, [hands, isAnimator, meId, t, i18n.language])

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
