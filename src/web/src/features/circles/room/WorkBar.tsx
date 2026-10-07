import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DoorClosed, Ellipsis, House } from 'lucide-react'
import type { Member } from '../../../api/circles'
import { Button } from '../../../components/Button'
import { Character } from '../../../components/Character'
import { Ring } from '../../../components/Ring'
import { usePopover } from '../../../components/usePopover'
import { activityById } from '../catalog'
import { serverNow } from '../present/presentation'
import { SendResults } from '../SendResults'
import { Count } from './Count'
import { useWide } from './useSide'
import { formatElapsed, roundProgress, stripFaces } from './sidebar'

export type RoomStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

/**
 * The room's work bar, one sticky row under the top bar: the circle's small ring (the people as bodies, you outlined;
 * it opens the People tab), the circle name with its connection status, the round that runs with who started it and
 * the time it has run over a brass rule, and the animator's Send results and Close circle. On phones the animator's
 * actions fold into a "More" menu. A polite status line announces round and connection changes.
 */
export function WorkBar({ circleId, name, isAnimator, closed, status, activity, startedBy, startedAt = null, members, online, meId, centreId, onPeople, onClose, closing }: {
  circleId: string
  name: string
  isAnimator: boolean
  closed: boolean
  status: RoomStatus
  activity: string | null
  startedBy: string | null
  /** When the round opened (ISO, server clock); until known the bar counts from when it saw the round. */
  startedAt?: string | null
  members: Member[]
  online: string[]
  meId: string
  /** The centre's id, for "Skip to the board" while a round runs. */
  centreId: string
  onPeople: () => void
  onClose: () => Promise<void>
  closing: boolean
}) {
  const { t } = useTranslation()
  const wide = useWide()
  const title = activity && activityById(activity) ? t(`activities.${activity}.title`) : ''
  const starter = members.find((m) => m.id === startedBy)
  const word = closed ? t('circles.room.closed') : t(`circles.status.${status}`)
  const running = !!activity && !!title && !closed

  // What changed since the last render, said once: a round opening or ending, the connection dropping or coming back.
  const [seen, setSeen] = useState({ activity, status, said: '', openedAt: serverNow() })
  if (seen.activity !== activity || seen.status !== status) {
    let said = seen.said
    if (seen.activity !== activity) {
      said = activity
        ? starter ? t('circles.room.started', { name: starter.name, activity: title }) : t('circles.room.roundOpen', { activity: title })
        : t('circles.room.roundEnded')
    } else if (!closed && (seen.status !== 'connecting' || status !== 'live')) {
      // The first "connecting → live" is the page arriving, not news.
      said = t('circles.room.connection', { status: t(`circles.status.${status}`) })
    }
    setSeen({ activity, status, said, openedAt: seen.activity !== activity ? serverNow() : seen.openedAt })
  }

  const elapsed = useElapsed(running, startedAt, seen.openedAt)
  const progress = roundProgress(elapsed)
  const faces = stripFaces(members, online, meId)
  const actions = (shown: boolean) => <RoomActions circleId={circleId} closed={closed} onClose={onClose} closing={closing} shown={shown} />
  const peopleLabel = t('circles.room.peopleStrip', { count: members.length })

  return (
    <section className="workbar" aria-label={t('circles.room.workbar')}>
      {running ? <a className="skip-link workbar__skip" href={`#${centreId}`}>{t('circles.room.skipToBoard')}</a> : null}
      {isAnimator ? (
        <Link to="/app" className="workbar__home" viewTransition>
          <House size={16} aria-hidden="true" />
          <span className="workbar__home-label">{t('common.nav.home')}</span>
        </Link>
      ) : null}
      {/* The circle as a ring: the people here first, you outlined, "+n" past four. Pressing it opens the People tab. */}
      <button type="button" className="workbar__people" aria-label={peopleLabel} title={peopleLabel} onClick={onPeople}>
        <Ring
          size="sm"
          className="workbar__ring"
          bodies={faces.map((m) => ({ id: m.id, character: m.character, name: m.name, ring: m.ring, me: m.id === meId }))}
          people={members.length}
          progress={running ? progress : undefined}
          closed={closed}
          compose
          label={peopleLabel}
        />
        <Count value={members.length} className="workbar__count" />
      </button>
      <div className="workbar__id">
        <h1 className="workbar__name" title={name}><bdi>{name}</bdi></h1>
        <span className="room__status workbar__status">
          <span className={`dot dot--${closed ? 'offline' : status}`} aria-hidden="true" />
          {word}
        </span>
      </div>
      {running ? (
        <span key={activity} className="workbar__round" data-activity={activity} style={{ '--round-progress': progress } as CSSProperties}>
          {starter ? <Character id={starter.character} ring={starter.ring} tag={false} className="workbar__round-char" /> : null}
          <span className="workbar__round-title">{title}</span>
          {starter ? (
            <span className="workbar__round-by">
              <Trans i18nKey="circles.room.startedBy" values={{ name: starter.name }} components={{ name: <bdi /> }} />
            </span>
          ) : null}
          <span className="workbar__round-time" role="timer" aria-label={t('circles.room.elapsed', { time: formatElapsed(elapsed) })}>
            <bdi dir="ltr" aria-hidden="true">{formatElapsed(elapsed)}</bdi>
          </span>
          <span className="workbar__round-rule" aria-hidden="true"><span className="workbar__round-fill" /></span>
        </span>
      ) : null}
      <div className="workbar__end">
        {isAnimator ? (wide ? <div className="workbar__actions">{actions(true)}</div> : <MoreMenu>{actions}</MoreMenu>) : null}
      </div>
      <p className="visually-hidden" role="status">{seen.said}</p>
    </section>
  )
}

/** Whole seconds the round has run, ticking once a second while it runs; the server's clock when the start is known. */
function useElapsed(running: boolean, startedAt: string | null, openedAt: number): number {
  const key = `${running}|${startedAt ?? ''}`
  // A new round (or a start time arriving) reads the clock at once; the interval keeps it moving from there.
  const [tick, setTick] = useState({ key, now: serverNow() })
  if (tick.key !== key) setTick({ key, now: serverNow() })
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setTick((t) => ({ ...t, now: serverNow() })), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  if (!running) return 0
  const parsed = startedAt ? Date.parse(startedAt) : NaN
  const start = Number.isFinite(parsed) ? parsed : openedAt
  return Math.max(0, Math.floor((tick.now - start) / 1000))
}

/** Send results, and Close circle with its inline confirmation (as on the page header before). */
function RoomActions({ circleId, closed, onClose, closing, shown }: { circleId: string; closed: boolean; onClose: () => Promise<void>; closing: boolean; shown: boolean }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const asked = useRef(false)

  // The confirmation replaces the button that had the focus; the safe choice takes it, and Cancel gives it back.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
    else if (asked.current) closeRef.current?.focus()
  }, [confirming])

  // When the phone menu closes, a pending confirmation goes with it: reopening starts again from "Close circle".
  const [wasShown, setWasShown] = useState(shown)
  if (wasShown !== shown) {
    setWasShown(shown)
    if (!shown) setConfirming(false)
  }

  if (closed) return <SendResults circleId={circleId} />
  return confirming ? (
    <span className="workbar__confirm" role="group" aria-label={t('circles.room.close')}>
      <Button ref={cancelRef} variant="subtle" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
      <Button variant="danger" className="room__close-confirm" busy={closing} onClick={() => void onClose()}>
        {t('circles.room.closeConfirm')}
      </Button>
    </span>
  ) : (
    <>
      <SendResults circleId={circleId} />
      <Button
        ref={closeRef}
        variant="default"
        className="room__close"
        icon={<DoorClosed size={16} />}
        onClick={() => {
          asked.current = true
          setConfirming(true)
        }}
      >
        {t('circles.room.close')}
      </Button>
    </>
  )
}

/** Phones: the animator's actions behind one button, the app's disclosure pattern (Escape and outside press close it). */
function MoreMenu({ children }: { children: (open: boolean) => React.ReactNode }) {
  const { t } = useTranslation()
  const { open, toggle, triggerRef, panelRef, panelProps } = usePopover()
  const id = useId()
  return (
    <div className="dropdown workbar__menu">
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn workbar__more"
        aria-expanded={open}
        aria-controls={id}
        aria-label={t('circles.room.more')}
        title={t('circles.room.more')}
        onClick={toggle}
      >
        <Ellipsis size={20} aria-hidden="true" />
      </button>
      <div ref={panelRef} id={id} className="dropdown__panel dropdown__panel--end workbar__menu-panel" hidden={!open} {...panelProps}>
        {children(open)}
      </div>
    </div>
  )
}
