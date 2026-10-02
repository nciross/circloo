import { useTranslation } from 'react-i18next'
import { FaceMark } from './Brand'

export function Loading() {
  const { t } = useTranslation()
  return (
    <div className="loading" role="status" aria-live="polite">
      <FaceMark className="loading__mark" mood={3} />
      <p>{t('common.loading')}</p>
    </div>
  )
}
