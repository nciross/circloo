import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { useDocumentTitle } from '../app/locale'
import { AuthLayout } from '../components/AuthLayout'
import { Character } from '../components/Character'
import { ButtonLink } from '../components/Button'
import '../styles/app.css'

/** Lost: a display headline, one character standing on the ground, and one pill home. */
export default function NotFound() {
  const { t } = useTranslation()
  useDocumentTitle('notFound.title')
  return (
    <AuthLayout note={false} plain>
      <div className="authform lost">
        <span className="lost__char" aria-hidden="true"><Character id="cat" tag={false} /></span>
        <p className="lost__code" aria-hidden="true">404</p>
        <h1 className="authform__title">{t('notFound.title')}</h1>
        <p className="authform__lead">{t('notFound.body')}</p>
        <ButtonLink to="/" size="lg" icon={<ArrowLeft className="flip-rtl" size={18} />}>{t('notFound.home')}</ButtonLink>
      </div>
    </AuthLayout>
  )
}
