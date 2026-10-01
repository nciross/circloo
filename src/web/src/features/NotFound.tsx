import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../app/locale'
import { Freezer } from '../components/Freezer'
import { MagnetLink } from '../components/Magnet'
import '../styles/app.css'

export default function NotFound() {
  const { t } = useTranslation()
  useDocumentTitle('notFound.title')
  return (
    <div className="fridge">
      <Freezer />
      <main id="main" className="door door--center">
        <span className="door__handle" aria-hidden="true" />
        <div className="sheet sheet--fallen">
          <h1 className="sheet__title">{t('notFound.title')}</h1>
          <p className="sheet__lead">{t('notFound.body')}</p>
          <MagnetLink to="/" color="cobalt">{t('notFound.home')}</MagnetLink>
        </div>
      </main>
    </div>
  )
}
