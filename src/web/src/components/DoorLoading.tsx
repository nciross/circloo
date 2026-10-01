import { useTranslation } from 'react-i18next'

export function DoorLoading() {
  const { t } = useTranslation()
  return (
    <div className="door door--center" role="status" aria-live="polite">
      <div className="door-loading">
        <div className="loading-magnets" aria-hidden="true">
          <span className="dot dot--tomato" />
          <span className="dot dot--cobalt" />
          <span className="dot dot--sunflower" />
        </div>
        <p>{t('common.loading')}</p>
      </div>
    </div>
  )
}
