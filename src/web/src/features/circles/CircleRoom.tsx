import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useCircle, useCloseCircle } from '../../api/circles'
import { useDocumentTitle } from '../../app/locale'
import { PageHeader } from '../../components/PageHeader'
import { Loading } from '../../components/Loading'
import { Panda } from '../../components/Panda'
import { ChatPanel } from './room/ChatPanel'
import { Board } from './Board'
import { Canvas } from './Canvas'
import { BOARD_COLUMNS, CANVAS, PRESENTATION, activityById } from './catalog'
import { useLive } from './present/presentation'
import { PresenterView } from './present/PresenterView'
import { ParticipantView } from './present/ParticipantView'
import { PresentationPicker } from './present/PresentationPicker'
import { useCircleConnection, useRoom } from './room'
import { RoomPanels } from './room/RoomPanels'
import { roundStartedAt } from './room/sidebar'
import { useSideState } from './room/useSide'
import { WorkBar } from './room/WorkBar'
import { WorkspaceDock } from './room/WorkspaceDock'
import '../../styles/circles.css'
import '../../styles/integrations.css'
import '../../styles/present.css'
import '../../styles/room.css'
import '../../styles/workspace.css'

const CENTRE_ID = 'room-centre'

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
  const [starting, setStarting] = useState<string | null>(null)
  // Lifted here so the work bar's people strip can open the People tab, like the rail does.
  const side = useSideState()
  const roomRef = useRef<HTMLDivElement>(null)
  useDocumentTitle('circles.room.title')

  useEffect(() => {
    if (circle.data) useRoom.getState().load(circle.data)
  }, [circle.data])
  useCircleConnection(circle.data)

  // The focal moment: a round opens from the work bar's people stack. Before the centre paints, its reveal gets the
  // stack's position (relative to the centre) as custom properties; the clip-path circle in workspace.css grows from there.
  const revealKey = room.circleId === circle.data?.id ? room.activity : circle.data?.currentActivity
  // On a phone a board or the canvas needs the screen: the sheet folds down when one opens (one tap brings it back).
  const boardOpen = !!revealKey && (!!BOARD_COLUMNS[revealKey] || revealKey === CANVAS)
  const { wide: sideWide, setSheet } = side
  useEffect(() => {
    if (boardOpen && !sideWide) setSheet('closed')
  }, [boardOpen, sideWide, setSheet])
  useLayoutEffect(() => {
    const root = roomRef.current
    const centre = root?.querySelector<HTMLElement>('.room__centre')
    const ring = root?.querySelector<HTMLElement>('.workbar__people')
    if (!centre || !ring) return
    const c = centre.getBoundingClientRect()
    const r = ring.getBoundingClientRect()
    centre.style.setProperty('--reveal-x', `${r.left + r.width / 2 - c.left}px`)
    centre.style.setProperty('--reveal-y', `${r.top + r.height / 2 - c.top}px`)
  }, [revealKey])

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
    setStarting(activityId)
    try {
      await room.start(activityId)
    } catch {
      // The room shows the error code.
    } finally {
      setStarting(null)
    }
  }

  const members = ready ? room.members : view.members
  const centreLabel = activity && activityById(activity) ? t(`activities.${activity}.title`) : t('circles.room.centre')
  const presenting = activity === PRESENTATION

  return (
    <div ref={roomRef} className="page room">
      <WorkBar
        circleId={view.id}
        name={view.name}
        isAnimator={isAnimator}
        closed={closed}
        status={room.status}
        activity={activity}
        startedBy={ready ? room.startedBy : null}
        startedAt={roundStartedAt(ready ? room.messages : view.messages, activity)}
        members={members}
        online={room.online}
        meId={view.me.id}
        centreId={CENTRE_ID}
        onPeople={() => side.openTab('people')}
        closing={close.isPending}
        onClose={async () => {
          await close.mutateAsync(view.id)
          navigate('/app', { replace: true })
        }}
      />

      {closed ? (
        <div className="room__closed">
          <section className="panel room__ended">
            <div className="panel__body">
              <Panda className="room__ended-panda" />
              <h2 className="panel__title">{t('circles.room.closedTitle')}</h2>
              <p className="field__help">{t('circles.room.closedBody')}</p>
              <Link to="/">{t('notFound.home')}</Link>
            </div>
          </section>
        </div>
      ) : (
        <div className={['room__grid', presenting && isAnimator && live ? 'is-presenting' : '', presenting && !isAnimator ? 'is-following' : ''].filter(Boolean).join(' ')}>
          <section id={CENTRE_ID} className="room__main room__centre" aria-label={centreLabel} tabIndex={-1}>
            {presenting ? (
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
                <ChatPanel activityId={activity} />
              </div>
            ) : isAnimator ? (
              <WorkspaceDock activities={view.activities} onStart={(a) => void start(a)} starting={starting} error={room.error} />
            ) : (
              <section className="panel room__wait" aria-live="polite">
                <div className="panel__body">
                  <Panda thinking className="room__wait-panda" />
                  <h2 className="panel__title">{t('circles.room.waitTitle')}</h2>
                  <p className="field__help">{t('circles.room.waitBody')}</p>
                </div>
              </section>
            )}
          </section>
          <RoomPanels
            side={side}
            isAnimator={isAnimator}
            members={members}
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
