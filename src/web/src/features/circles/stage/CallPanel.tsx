import { useTranslation } from 'react-i18next'
import { useStage } from './stage'
import { DiscussionSwitch } from './DiscussionSwitch'

/**
 * The Call tab of the room's rail. The animator gets the real Live discussion switch; everyone sees whether it is on and the
 * stage, which says plainly that audio and video come next (T906/T907 bring the tiles and controls).
 */
export function CallPanel({ isAnimator }: { isAnimator: boolean }) {
  const { t } = useTranslation()
  const on = useStage((s) => s.discussion?.on ?? false)
  return (
    <div className="call">
      {isAnimator ? (
        <DiscussionSwitch />
      ) : (
        <p className="call__state" role="status">
          <span className={`call__state-mark${on ? ' is-on' : ''}`} aria-hidden="true" />
          {on ? t('circles.call.isOn') : t('circles.call.isOff')}
        </p>
      )}
      <section className="call__stage" aria-labelledby="call-stage-title">
        <h2 id="call-stage-title" className="call__stage-title">
          {t('circles.call.stage')}
          <span className="lozenge">{t('common.soon')}</span>
        </h2>
        <p className="call__stage-body">{t('circles.call.stageBody')}</p>
      </section>
    </div>
  )
}
