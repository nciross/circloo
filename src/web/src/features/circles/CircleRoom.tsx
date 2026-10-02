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
import { ActivityGrid, InviteCard, PeopleRing } from './parts'
import { SendResults } from './SendResults'
import { Chat } from './Chat'
import { Board } from './Board'
import { BOARD_COLUMNS } from './catalog'
import { Segmented } from '../../components/Segmented'
import { useCircleConnection, useRoom } from './room'
import '../../styles/circles.css'
import '../../styles/integrations.css'

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
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)
  const [pane, setPane] = useState<'board' | 'chat'>('board')
  useDocumentTitle('circles.room.title')

  useEffect(() => {
    if (circle.data) useRoom.getState().load(circle.data)
  }, [circle.data])
  useCircleConnection(circle.data)

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

  const start = async (activityId: string) => {
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
        <div className="room__grid">
          <div className="room__main">
            {activity && BOARD_COLUMNS[activity] ? (
              <>
                <Segmented<'board' | 'chat'>
                  label={t('boards.view')}
                  hideLabel
                  className="room__pane"
                  value={pane}
                  onChange={setPane}
                  choices={[{ value: 'board', label: t('boards.board') }, { value: 'chat', label: t('circles.room.conversation') }]}
                />
                <div key={`${activity}-${pane}`} className="room__reveal">
                  {pane === 'board' ? <Board activityId={activity} /> : <Chat activityId={activity} />}
                </div>
              </>
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
          <aside className="room__side">
            <section className="panel" aria-labelledby="people-title">
              <div className="panel__head">
                <h2 id="people-title" className="panel__title">{t('circles.room.peopleTitle')}</h2>
              </div>
              <div className="panel__body">
                <PeopleRing members={ready ? room.members : view.members} online={room.online} meId={view.me.id} arrivals={room.arrivals} />
                <p className="visually-hidden" aria-live="polite">{room.announcement ? t('circles.room.joined', { name: room.announcement }) : ''}</p>
              </div>
            </section>
            {isAnimator && view.joinCode ? <InviteCard code={view.joinCode} fresh={fresh} /> : null}
          </aside>
        </div>
      )}
    </div>
  )
}
