import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { HandsView } from '../../../api/circles'
import type { CallNoticeKind } from '../../../api/discussion'
import { useRoom } from '../room'
import { HANDS_EVERY, HANDS_GATHER, NAMES_MAX, listNames, myHand, newlyRaised, sameHand, type MyHand } from '../room/hands'
import { noticeText } from './notices'
import { useStage, type CallNotice } from './stage'

/*
 * What screen readers hear about the call and the hands (spec 009 US7 #2, FR-925, SC-908), in one polite voice for the
 * room. Call started or ended, video, the speaking mode, every microphone off, the floor given or taken, me muted or
 * allowed, me removed or let back in, and the hands of spec 008: the animator hears hands go up, a participant hears
 * their own place, and during a call everyone hears who has the floor. A burst becomes one announcement, said after a
 * short gather and never sooner than a few seconds after the last one, the batching of spec 008's hands (HANDS_GATHER,
 * HANDS_EVERY). Within a batch the later of two opposite notices wins (video on then off says "video is off"), the floor
 * given to you is said once (the notice, not the hands as well), and a call that ended takes the rest with it.
 *
 * Active speaker changes are never announced: the tile's "Speaking" and the Call tab's people list carry them as text.
 * The notice line above the call's bar shows the same notice without a live region of its own, so it is not said twice.
 */

/** Notices that answer the same question: within a batch only the latest of each is said. */
type Topic = 'call' | 'removal' | 'floor' | 'mic' | 'camera' | 'video' | 'mode' | 'everyone'
const TOPIC: Record<CallNoticeKind, Topic> = {
  'call-started': 'call',
  'call-ended': 'call',
  removed: 'removal',
  'allowed-back': 'removal',
  'floor-given': 'floor',
  'floor-taken': 'floor',
  'mic-muted': 'mic',
  'mic-allowed': 'mic',
  'camera-stopped': 'camera',
  'camera-allowed': 'camera',
  'video-on': 'video',
  'video-off': 'video',
  'mode-open': 'mode',
  'mode-hand': 'mode',
  'muted-everyone': 'everyone',
}
/** The order sentences are said in: what changes the most for you first. */
const ORDER: Topic[] = ['call', 'removal', 'floor', 'mic', 'camera', 'video', 'mode', 'everyone']

/** What happened since the last announcement. */
export interface Batch {
  /** Call notices in the order they arrived. */
  notices: CallNotice[]
  /** The animator's view: hands that went up in this batch, in order. */
  raised: string[]
  /** The hands now. */
  hands: HandsView
  /** A participant's own hand: where it stood when they were last told, and now. */
  mine: { told: MyHand; now: MyHand }
  /** Who had the floor when last told; null outside a call, where only your own place is said (spec 008). */
  floorTold: string | null | undefined
}

export interface Listener {
  meId: string | null | undefined
  isAnimator: boolean
  nameOf: (id: string) => string
  lng: string
}

/** A sentence ends with a stop, so several in one announcement read as several. */
export function sentence(text: string): string {
  const s = text.trim()
  return !s || /[.!?…؟。]$/.test(s) ? s : `${s}.`
}

/** The one announcement for a batch, or '' when there is nothing to say to this person. */
export function callSay(t: TFunction, batch: Batch, who: Listener): string {
  const latest = new Map<Topic, CallNotice>()
  for (const n of batch.notices) if (noticeText(t, n, who.meId) !== null) latest.set(TOPIC[n.kind], n)
  const ended = latest.get('call')?.kind === 'call-ended'
  const removed = latest.get('removal')?.kind === 'removed'
  const parts: string[] = []
  for (const topic of ORDER) {
    const n = latest.get(topic)
    if (!n) continue
    // A call that ended (or a removal) makes the rest of the batch history.
    if (ended && topic !== 'call') continue
    if (removed && (topic === 'floor' || topic === 'mic' || topic === 'camera')) continue
    parts.push(noticeText(t, n, who.meId)!)
  }

  if (who.isAnimator) {
    // The animator hears hands go up; one raised and lowered within the batch is not news.
    const up = new Set(batch.hands.queue.map((h) => h.memberId))
    const names = batch.raised.filter((id) => up.has(id)).map(who.nameOf).filter(Boolean)
    if (names.length === 1) parts.push(t('circles.hands.say.raisedOne', { name: names[0] }))
    else if (names.length > 1 && names.length <= NAMES_MAX) parts.push(t('circles.hands.say.raisedMany', { names: listNames(names, who.lng) }))
    else if (names.length > NAMES_MAX) parts.push(t('circles.hands.say.raisedCount', { count: names.length }))
    return parts.map(sentence).join(' ')
  }

  // During a call, everyone hears who has the floor; the person given it hears the notice (or their place) instead.
  const floor = batch.hands.floor
  if (batch.floorTold !== undefined && batch.floorTold !== floor && !ended) {
    if (floor && floor !== who.meId) parts.push(t('circles.call.lines.floor', { name: who.nameOf(floor) }))
    else if (!floor && batch.floorTold && batch.floorTold !== who.meId) parts.push(t('circles.call.lines.floorEnd', { name: who.nameOf(batch.floorTold) }))
  }
  // Your own place, unless a notice already said it (the floor given or taken, the call ended, you removed).
  const { told, now } = batch.mine
  if (!sameHand(told, now) && !latest.has('floor') && !ended && !removed) {
    parts.push(
      now.kind === 'floor' ? t('circles.hands.youHaveFloor')
      : now.kind === 'queue' ? t('circles.hands.place', { count: now.place, ordinal: true })
      : t('circles.hands.say.down'),
    )
  }
  return parts.map(sentence).join(' ')
}

/**
 * The room's polite announcement (see the top of this file). Notices and hands already there when the room opens are
 * where you start, not news. The line is emptied between announcements, so the same words are heard again.
 */
export function useCallAnnouncement(): string {
  const { t, i18n } = useTranslation()
  const hands = useRoom((s) => s.hands)
  const me = useRoom((s) => s.me)
  const notices = useStage((s) => s.notices)
  const callOn = useStage((s) => s.discussion?.on ?? false)
  const isAnimator = me?.role === 'animator'
  const meId = me?.id
  const [said, setSaid] = useState('')
  const seenNotice = useRef(notices.at(-1)?.id ?? 0)
  const pending = useRef<CallNotice[]>([])
  const raised = useRef<string[]>([])
  const before = useRef(hands)
  const told = useRef<MyHand>(myHand(hands, meId))
  const floorTold = useRef<string | null>(hands.floor)
  const callSeen = useRef(callOn)
  const lastSaid = useRef(0)
  const sayTimer = useRef<number | undefined>(undefined)
  const clearTimer = useRef<number | undefined>(undefined)
  const latest = useRef({ t, lng: i18n.language, isAnimator, meId, callOn })

  useEffect(() => {
    latest.current = { t, lng: i18n.language, isAnimator, meId, callOn }
    if (callOn) callSeen.current = true
  })

  const fire = () => {
    sayTimer.current = undefined
    const { t: tr, lng, isAnimator: animator, meId: id } = latest.current
    const room = useRoom.getState()
    const now = room.hands
    const names = new Map(room.members.map((m) => [m.id, m.name]))
    const text = callSay(
      tr,
      {
        notices: pending.current,
        raised: raised.current,
        hands: now,
        mine: { told: told.current, now: myHand(now, id) },
        floorTold: callSeen.current ? floorTold.current : undefined,
      },
      { meId: id, isAnimator: animator, nameOf: (x) => names.get(x) ?? '', lng },
    )
    pending.current = []
    raised.current = []
    told.current = myHand(now, id)
    floorTold.current = now.floor
    callSeen.current = latest.current.callOn
    if (!text) return
    lastSaid.current = Date.now()
    setSaid(text)
    window.clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(() => setSaid(''), HANDS_EVERY - 500)
  }
  const schedule = () => {
    if (sayTimer.current !== undefined) return
    sayTimer.current = window.setTimeout(fire, Math.max(HANDS_GATHER, lastSaid.current + HANDS_EVERY - Date.now()))
  }

  // Another person on this page (another circle loaded): start from where they stand, silently.
  useEffect(() => {
    const now = useRoom.getState().hands
    told.current = myHand(now, meId)
    floorTold.current = now.floor
    raised.current = []
  }, [meId])

  useEffect(() => {
    const fresh = notices.filter((n) => n.id > seenNotice.current)
    if (fresh.length === 0) return
    seenNotice.current = fresh.at(-1)!.id
    pending.current.push(...fresh)
    schedule()
    // schedule reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notices])

  useEffect(() => {
    if (before.current === hands) return
    if (isAnimator) raised.current.push(...newlyRaised(before.current, hands).filter((id) => !raised.current.includes(id)))
    before.current = hands
    const news = isAnimator
      ? raised.current.length > 0
      : !sameHand(myHand(hands, meId), told.current) || (callSeen.current && hands.floor !== floorTold.current)
    if (news) schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hands, isAnimator, meId])

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
