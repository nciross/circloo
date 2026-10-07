import { useTranslation } from 'react-i18next'
import { StickyNote } from 'lucide-react'
import { Button } from '../../../components/Button'
import { CANVAS } from '../catalog'
import { ActivityGrid } from '../parts'

/**
 * What the animator sees between rounds. When the circle has the live canvas, a large sheet of the same dotted paper leads
 * with "Open the whiteboard" (the one primary action), and the other rounds sit under it; otherwise the rounds alone.
 * Nothing starts by itself: the server lets only the animator start, and only the circle's chosen activities.
 */
export function WorkspaceDock({ activities, onStart, starting, error }: {
  activities: string[]
  onStart: (activityId: string) => void
  /** The activity being started, while its request runs. */
  starting: string | null
  error: string | null
}) {
  const { t } = useTranslation()
  const hasCanvas = activities.includes(CANVAS)
  const others = activities.filter((a) => a !== CANVAS)
  const errorLine = error ? <p className="field__error" role="alert">{t(`circles.errors.${error}`, { defaultValue: t('circles.errors.failed') })}</p> : null

  return (
    <div className="dock" data-perch="pick">
      {hasCanvas ? (
        <section className="dock__paper" aria-labelledby="dock-paper-title" data-activity={CANVAS}>
          <h2 id="dock-paper-title" className="dock__title">{t('activities.canvas.title')}</h2>
          <p className="dock__lead">{t('activities.canvas.body')}</p>
          <Button size="lg" className="dock__open" icon={<StickyNote size={18} />} busy={starting === CANVAS} onClick={() => onStart(CANVAS)}>
            {t('circles.room.openWhiteboard')}
          </Button>
          {others.length === 0 ? errorLine : null}
        </section>
      ) : null}
      {others.length > 0 ? (
        <section className="panel" aria-labelledby="pick-title">
          <div className="panel__head">
            <h2 id="pick-title" className="panel__title">{hasCanvas ? t('circles.room.otherRounds') : t('circles.room.pickTitle')}</h2>
          </div>
          <div className="panel__body">
            {hasCanvas ? null : <p className="field__help">{t('circles.room.pickBody')}</p>}
            <ActivityGrid ids={others} mode="start" onStart={onStart} busy={starting !== null} startVariant={hasCanvas ? 'default' : 'primary'} />
            {errorLine}
          </div>
        </section>
      ) : null}
    </div>
  )
}
