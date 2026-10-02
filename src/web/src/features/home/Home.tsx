import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { CalendarHeart, Plus, Heart, LayoutGrid, MessagesSquare, Plug, Sparkles } from 'lucide-react'
import { useMe } from '../../api/hooks'
import { useFavourites } from '../../api/sparks'
import { useMyCircles } from '../../api/circles'
import { Panda } from '../../components/Panda'
import { useDocumentTitle } from '../../app/locale'
import { ButtonLink } from '../../components/Button'
import { PageHeader } from '../../components/PageHeader'
import { useUiStore } from '../../stores/ui'
import { useDeckStore } from '../../stores/deck'
import { useAskBar } from '../shell/askBarStore'
import { IcebreakerCard } from '../landing/IcebreakerCard'
import '../../styles/app.css'
import '../../styles/circles.css'

const MODULES = [
  { id: 'icebreakers', icon: MessagesSquare, live: true, to: '/app/icebreakers' },
  { id: 'boards', icon: LayoutGrid, live: true, to: '/app/circles/new' },
  { id: 'integrations', icon: Plug, live: true, to: '/app/integrations' },
  { id: 'checkins', icon: CalendarHeart, live: false, to: null },
] as const

/** Proposals only, never actions: each opens Ask circloo with its plan ready to check. */
function Suggestions() {
  const { t } = useTranslation()
  const show = useAskBar((s) => s.show)
  const items = t('home.suggest.items', { returnObjects: true }) as string[]
  return (
    <section className="panel panel--ai" aria-labelledby="suggest-title">
      <div className="panel__head">
        <h2 id="suggest-title" className="panel__title">
          <span className="ai-mark" aria-hidden="true"><Sparkles size={14} /></span>
          {t('home.suggest.title')}
        </h2>
      </div>
      <ul className="suggest">
        {items.map((text) => (
          <li key={text} className="suggest__item">
            <p className="suggest__text"><span className="visually-hidden">{t('home.suggest.label')}: </span>{text}</p>
            <button type="button" className="btn btn--default btn--sm" onClick={() => show(text)}>
              <span className="btn__label">{t('home.suggest.open')}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="panel__foot">
        {t('home.suggest.why')} <Link to="/app/settings" viewTransition>{t('common.settings')}</Link>
      </p>
    </section>
  )
}

/** The circles you run or joined, newest first: open one to go back into the room. */
function MyCircles() {
  const { t } = useTranslation()
  const circles = useMyCircles()
  const list = circles.data ?? []
  return (
    <section className="panel dash__wide" aria-labelledby="circles-title">
      <div className="panel__head">
        <h2 id="circles-title" className="panel__title">{t('circles.mine.title')}</h2>
        <ButtonLink to="/app/circles/new" size="sm" variant="default" icon={<Plus size={14} />}>{t('circles.new')}</ButtonLink>
      </div>
      {circles.isPending ? (
        <p className="panel__empty" role="status">{t('common.loading')}</p>
      ) : circles.isError ? (
        <p className="field__error panel__empty" role="alert">{t('common.errorGeneric')}</p>
      ) : list.length === 0 ? (
        <div className="circles-empty">
          <Panda className="circles-empty__panda" />
          <div>
            <p className="circles-empty__title">{t('circles.mine.emptyTitle')}</p>
            <p className="field__help">{t('circles.mine.emptyBody')}</p>
          </div>
          <ButtonLink to="/app/circles/new" icon={<Plus size={16} />}>{t('circles.mine.create')}</ButtonLink>
        </div>
      ) : (
        <ul className="circle-list">
          {list.map((c) => (
            <li key={c.id} className="circle-list__item">
              <Link className="circle-list__name" to={`/app/circles/${c.id}`} viewTransition><bdi>{c.name}</bdi></Link>
              <span className={`lozenge ${c.status === 'open' ? 'lozenge--success' : 'lozenge--neutral'}`}>{t(`circles.status.${c.status}`)}</span>
              <span className="circle-list__meta">{t(`circles.roles.${c.role}`)} · {t('circles.people', { count: c.people })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The three latest favourites; opening one puts it on the icebreaker board. */
function KeepersSummary() {
  const { t } = useTranslation()
  const favourites = useFavourites()
  const pin = useDeckStore((s) => s.pin)
  const list = favourites.data?.slice(0, 3) ?? []
  return (
    <section className="panel" aria-labelledby="keepers-summary">
      <div className="panel__head">
        <h2 id="keepers-summary" className="panel__title">{t('ice.keepers.favourites')}</h2>
        <Link className="panel__link" to="/app/icebreakers" viewTransition>{t('home.openIcebreakers')}</Link>
      </div>
      {favourites.isPending ? (
        <p className="panel__empty" role="status">{t('common.loading')}</p>
      ) : favourites.isError ? (
        <p className="field__error" role="alert">{t('common.errorGeneric')}</p>
      ) : list.length === 0 ? (
        <p className="panel__empty">{t('ice.keepers.emptyFavourites')}</p>
      ) : (
        <ul className="mini-list">
          {list.map((s) => (
            <li key={s.id} className="mini-list__item" lang={s.lang}>
              <Heart className="mini-list__icon" size={16} aria-hidden="true" />
              <Link to="/app/icebreakers" onClick={() => pin(s)} dir="auto" viewTransition>{s.text}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function Home() {
  const { t } = useTranslation()
  useDocumentTitle('common.home')
  const { data: me } = useMe()
  const autonomy = useUiStore((s) => s.autonomy)

  return (
    <div className="page">
      <PageHeader
        title={<Trans i18nKey="home.greeting" values={{ name: me?.displayName ?? '' }} components={{ name: <bdi /> }} />}
        lead={t('home.lead')}
        actions={
          <ButtonLink to="/app/circles/new" icon={<Plus size={16} strokeWidth={2.5} />}>
            {t('circles.new')}
          </ButtonLink>
        }
      />

      <div className="dash">
        <MyCircles />
        <section className="panel dash__today" aria-labelledby="today-title">
          <div className="panel__head">
            <h2 id="today-title" className="panel__title">{t('landing.teaser.title')}</h2>
          </div>
          <div className="panel__body">
            <IcebreakerCard bare />
          </div>
        </section>

        <div className="dash__side">
          {autonomy === 'suggest' ? <Suggestions /> : null}
          <KeepersSummary />
        </div>

        <section className="panel dash__wide" aria-labelledby="workspace-title">
          <div className="panel__head">
            <h2 id="workspace-title" className="panel__title">{t('home.nextTitle')}</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('home.table.module')}</th>
                <th scope="col">{t('home.table.status')}</th>
                <th scope="col" className="table__about">{t('home.table.about')}</th>
              </tr>
            </thead>
            <tbody>
              {MODULES.map(({ id, icon: Icon, live, to }) => (
                <tr key={id}>
                  <th scope="row">
                    <span className="table__module">
                      <span className={`module-icon${live ? ' module-icon--live' : ''}`} aria-hidden="true"><Icon size={16} /></span>
                      {live && to ? <Link to={to} viewTransition>{t(`home.modules.${id}.title`)}</Link> : t(`home.modules.${id}.title`)}
                    </span>
                  </th>
                  <td>
                    <span className={`lozenge ${live ? 'lozenge--success' : 'lozenge--neutral'}`}>
                      {live ? t('home.modules.icebreakers.tag') : t('common.soon')}
                    </span>
                  </td>
                  <td className="table__about">{t(`home.modules.${id}.body`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
