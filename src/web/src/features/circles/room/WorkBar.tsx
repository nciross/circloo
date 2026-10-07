import { useEffect, useId, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DoorClosed, Ellipsis, House } from 'lucide-react'
import type { Member } from '../../../api/circles'
import { Button } from '../../../components/Button'
import { Character } from '../../../components/Character'
import { usePopover } from '../../../components/usePopover'
import { activityById } from '../catalog'
import { SendResults } from '../SendResults'
import { useWide } from './useSide'
import { stripFaces, stripMore } from './sidebar'

export type RoomStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

/**
 * The room's work bar, one sticky row under the top bar: circle name, connection status, the round that runs and who
 * started it, the people strip (opens the People tab), and the animator's Send results and Close circle. On phones the
 * animator's actions fold into a "More" menu. A polite status line announces round and connection changes.
 */
export function WorkBar({ circleId, name, isAnimator, closed, status, activity, startedBy, members, online, meId, centreId, onPeople, onClose, closing }: {
  circleId: string
  name: string
  isAnimator: boolean
  closed: boolean
  status: RoomStatus
  activity: string | null
  startedBy: string | null
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

  // What changed since the last render, said once: a round opening or ending, the connection dropping or coming back.
  const [seen, setSeen] = useState({ activity, status, said: '' })
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
    setSeen({ activity, status, said })
  }

  const faces = stripFaces(members, online, meId)
  const more = stripMore(members.length)
  const actions = (shown: boolean) => <RoomActions circleId={circleId} closed={closed} onClose={onClose} closing={closing} shown={shown} />

  return (
    <section className="workbar" aria-label={t('circles.room.workbar')}>
      {activity && !closed ? <a className="skip-link workbar__skip" href={`#${centreId}`}>{t('circles.room.skipToBoard')}</a> : null}
      {isAnimator ? (
        <Link to="/app" className="workbar__home" viewTransition>
          <House size={16} aria-hidden="true" />
          <span className="workbar__home-label">{t('common.nav.home')}</span>
        </Link>
      ) : null}
      <div className="workbar__id">
        <h1 className="workbar__name" title={name}><bdi>{name}</bdi></h1>
        <span className="room__status workbar__status">
          <span className={`dot dot--${closed ? 'offline' : status}`} aria-hidden="true" />
          {word}
        </span>
      </div>
      {activity && title && !closed ? (
        <span key={activity} className="workbar__round" data-activity={activity}>
          {starter ? <Character id={starter.character} ring={starter.ring} tag={false} className="workbar__round-char" /> : null}
          <span className="workbar__round-title">{title}</span>
          {starter ? (
            <span className="workbar__round-by">
              <Trans i18nKey="circles.room.startedBy" values={{ name: starter.name }} components={{ name: <bdi /> }} />
            </span>
          ) : null}
        </span>
      ) : null}
      <div className="workbar__end">
        <button
          type="button"
          className="workbar__people"
          aria-label={t('circles.room.peopleStrip', { count: members.length })}
          title={t('circles.room.peopleStrip', { count: members.length })}
          onClick={onPeople}
        >
          <span className="workbar__faces" aria-hidden="true">
            {faces.map((m) => (
              <Character key={m.id} id={m.character} ring={m.ring} tag={false} className={`workbar__face${m.id === meId || online.includes(m.id) ? '' : ' is-away'}`} />
            ))}
          </span>
          {more ? <span className="workbar__more-count" aria-hidden="true">{more}</span> : null}
        </button>
        {isAnimator ? (wide ? <div className="workbar__actions">{actions(true)}</div> : <MoreMenu>{actions}</MoreMenu>) : null}
      </div>
      <p className="visually-hidden" role="status">{seen.said}</p>
    </section>
  )
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
