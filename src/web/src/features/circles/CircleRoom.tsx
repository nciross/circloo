import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { DoorClosed } from 'lucide-react'
import { useCircle, useCloseCircle } from '../../api/circles'
import { useDocumentTitle } from '../../app/locale'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { Loading } from '../../components/Loading'
import { Panda } from '../../components/Panda'
import { ActivityGrid } from './parts'
import { SendResults } from './SendResults'
import { Chat } from './Chat'
import { Board } from './Board'
import { Canvas } from './Canvas'
import { BOARD_COLUMNS, CANVAS, PRESENTATION } from './catalog'
import { useLive } from './present/presentation'
import { PresenterView } from './present/PresenterView'
import { ParticipantView } from './present/ParticipantView'
import { PresentationPicker } from './present/PresentationPicker'
import { useCircleConnection, useRoom } from './room'
import { RoomPanels } from './room/RoomPanels'
import '../../styles/circles.css'
import '../../styles/integrations.css'
import '../../styles/present.css'
import '../../styles/room.css'

const STATUS_KEY = { connecting: 'connecting', live: 'live', reconnecting: 'reconnecting', offline: 'offline' } as const

/** The live room, for the animator (inside the app) and for participants (guest or signed in). */
export default function CircleRoom() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const fresh = (useLocation().state as { created?: boolean } | null)?.created === true
  const circle = useCircle(id)
  const close = useCloseCircle()
  const room = useRoom()
  const live = useLive((s) => s.state)
  const [picking, setPicking] = useState(false)
  // A reload while presenting: the state arrives right after entering; until then show a wait, not the picker
  // (whose "Present" would replace the running session). After a few seconds the picker appears as a way out.
  const [stateLate, setStateLate] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)
  useDocumentTitle('circles.room.title')

  useEffect(() => {
    if (circle.data) useRoom.getState().load(circle.data)
  }, [circle.data])
  useCircleConnection(circle.data)

  useEffect(() => {
    if (live || room.activity !== PRESENTATION) return
    const timer = window.setTimeout(() => setStateLate(true), 3000)
    return () => window.clearTimeout(timer)
  }, [live, room.activity])

  if (circle.isPending) return <Loading />
  if (circle.isError || !circle.data) {
    return (
      <div className="page page--narrow">
        <PageHeader title={t('circles.missing.title')} lead={t('circles.missing.body')} />
      </div>
    )
  }

  const view = circle.data
  const isAnimator = room.me?.role === 'animator'
  const ready = room.circleId === view.id
  const activity = ready ? room.activity : view.currentActivity
  const closed = ready ? room.closed : view.status === 'closed'

  // The conversation lives in the sidebar next to a board, a canvas or a presentation; a chat activity is the main area itself.
  const chatActivity = activity && (activity === PRESENTATION || BOARD_COLUMNS[activity] || activity === CANVAS) ? activity : null

  const start = async (activityId: string) => {
    // A presentation starts from the picker: the animator chooses which one (spec 006 US3 #1).
    if (activityId === PRESENTATION) {
      room.clearError()
      setPicking(true)
      return
    }
    setStarting(true)
    try {
      await room.start(activityId)
    } catch {
      // The room shows the error code.
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="page room">
      <PageHeader
        crumbs={isAnimator ? [{ to: '/app', label: t('common.nav.home') }] : []}
        title={<bdi>{view.name}</bdi>}
        lead={
          <span className="room__status">
            <span className={`dot dot--${closed ? 'offline' : room.status}`} aria-hidden="true" />
            {closed ? t('circles.room.closed') : t(`circles.status.${STATUS_KEY[room.status]}`)}
          </span>
        }
        actions={
          isAnimator && !closed ? (
            confirming ? (
              <>
                <Button variant="subtle" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
                <Button variant="danger" busy={close.isPending} onClick={async () => { await close.mutateAsync(view.id); navigate('/app', { replace: true }) }}>
                  {t('circles.room.closeConfirm')}
                </Button>
              </>
            ) : (
              <>
                <SendResults circleId={view.id} />
                <Button variant="default" className="room__close" icon={<DoorClosed size={16} />} onClick={() => setConfirming(true)}>{t('circles.room.close')}</Button>
              </>
            )
          ) : isAnimator ? (
            <SendResults circleId={view.id} />
          ) : null
        }
      />

      {closed ? (
        <section className="panel room__ended">
          <div className="panel__body">
            <Panda className="room__ended-panda" />
            <h2 className="panel__title">{t('circles.room.closedTitle')}</h2>
            <p className="field__help">{t('circles.room.closedBody')}</p>
            <Link to="/">{t('notFound.home')}</Link>
          </div>
        </section>
      ) : (
        <div className={['room__grid', activity === PRESENTATION && isAnimator && live ? 'is-presenting' : '', activity === PRESENTATION && !isAnimator ? 'is-following' : ''].filter(Boolean).join(' ')}>
          <div className="room__main">
            {activity === PRESENTATION ? (
              <div className="room__reveal">
                {isAnimator ? (live ? <PresenterView state={live} circleId={view.id} /> : stateLate ? <PresentationPicker /> : <Loading />) : <ParticipantView />}
              </div>
            ) : picking && isAnimator && !activity ? (
              <div className="room__reveal">
                <PresentationPicker onBack={() => setPicking(false)} onStarted={() => setPicking(false)} />
              </div>
            ) : activity && (BOARD_COLUMNS[activity] || activity === CANVAS) ? (
              <div key={activity} className="room__reveal">
                {activity === CANVAS ? <Canvas /> : <Board activityId={activity} />}
              </div>
            ) : activity ? (
              <div key={activity} className="room__reveal">
                <Chat activityId={activity} />
              </div>
            ) : isAnimator ? (
              <section className="panel" aria-labelledby="pick-title" data-perch="pick">
                <div className="panel__head">
                  <h2 id="pick-title" className="panel__title">{t('circles.room.pickTitle')}</h2>
                </div>
                <div className="panel__body">
                  <p className="field__help">{t('circles.room.pickBody')}</p>
                  <ActivityGrid ids={view.activities} mode="start" onStart={start} busy={starting} />
                  {room.error ? <p className="field__error" role="alert">{t(`circles.errors.${room.error}`, { defaultValue: t('circles.errors.failed') })}</p> : null}
                </div>
              </section>
            ) : (
              <section className="panel room__wait" aria-live="polite">
                <div className="panel__body">
                  <Panda thinking className="room__wait-panda" />
                  <h2 className="panel__title">{t('circles.room.waitTitle')}</h2>
                  <p className="field__help">{t('circles.room.waitBody')}</p>
                </div>
              </section>
            )}
          </div>
          <RoomPanels
            members={ready ? room.members : view.members}
            online={room.online}
            meId={view.me.id}
            arrivals={room.arrivals}
            announcement={room.announcement}
            chatActivity={chatActivity}
            invite={isAnimator && view.joinCode ? { code: view.joinCode, fresh } : undefined}
          />
        </div>
      )}
    </div>
  )
}
