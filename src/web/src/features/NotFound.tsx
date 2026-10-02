import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '../app/locale'
import { AuthLayout } from '../components/AuthLayout'
import { ButtonLink } from '../components/Button'
import '../styles/app.css'

export default function NotFound() {
  const { t } = useTranslation()
  useDocumentTitle('notFound.title')
  return (
    <AuthLayout note={false}>
      <div className="authform lost">
        <p className="lost__code" aria-hidden="true">404</p>
        <h1 className="authform__title">{t('notFound.title')}</h1>
        <p className="authform__lead">{t('notFound.body')}</p>
        <ButtonLink to="/">{t('notFound.home')}</ButtonLink>
      </div>
    </AuthLayout>
  )
}
