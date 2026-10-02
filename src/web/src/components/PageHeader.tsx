import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

/** Breadcrumbs to the parents, the page title, a one-line lead and the page actions. */
export function PageHeader({
  crumbs = [],
  title,
  lead,
  actions,
}: {
  crumbs?: { to: string; label: string }[]
  title: ReactNode
  lead?: ReactNode
  actions?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <header className="page-header">
      {crumbs.length ? (
        <nav className="crumbs" aria-label={t('common.breadcrumb')}>
          <ol>
            {crumbs.map((c) => (
              <li key={c.to}>
                <Link to={c.to} viewTransition>{c.label}</Link>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="page-header__row">
        <div className="page-header__text">
          <h1 className="page-header__title">{title}</h1>
          {lead ? <p className="page-header__lead">{lead}</p> : null}
        </div>
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </div>
    </header>
  )
}
