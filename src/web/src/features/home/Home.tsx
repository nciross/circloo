import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Heart, Plus } from 'lucide-react'
import { useMe } from '../../api/hooks'
import { useFavourites } from '../../api/sparks'
import { useMyCircles } from '../../api/circles'
import { Panda } from '../../components/Panda'
import { useDocumentTitle } from '../../app/locale'
import { ButtonLink } from '../../components/Button'
import { FaceMark } from '../../components/Brand'
import { TourVideo } from '../../components/TourVideo'
import { useDeckStore } from '../../stores/deck'
import { IcebreakerCard } from '../landing/IcebreakerCard'
import '../../styles/app.css'
import '../../styles/circles.css'


/** The circles you run or joined, newest first: open one to go back into the room. */
function MyCircles() {
  const { t } = useTranslation()
  const circles = useMyCircles()
  const list = circles.data ?? []
  return (
    <section className="panel" aria-labelledby="circles-title" data-perch="circles">
      <div className="panel__head">
        <h2 id="circles-title" className="panel__title">{t('circles.mine.title')}</h2>
        {list.length > 0 ? <ButtonLink to="/app/circles/new" size="sm" variant="default" icon={<Plus size={14} />}>{t('circles.new')}</ButtonLink> : null}
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

/** Before the first circle: what a circle looks like, in 20 seconds. It plays only when asked. */
function FirstTour() {
  const { t } = useTranslation()
  return (
    <section className="panel home-tour" aria-labelledby="home-tour-title">
      <div className="panel__head">
        <h2 id="home-tour-title" className="panel__title">{t('landing.tour.title')}</h2>
      </div>
      <div className="panel__body home-tour__body">
        <p className="field__help">{t('landing.tour.lead')}</p>
        <TourVideo hideCaption />
      </div>
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
  const circles = useMyCircles()

  return (
    <div className="page">
      <header className="hello">
        <FaceMark mood={5} interactive className="hello__face" />
        <div className="hello__text">
          <h1 className="page-header__title">
            <Trans i18nKey="home.greeting" values={{ name: me?.displayName ?? '' }} components={{ name: <bdi /> }} />
          </h1>
          <p className="page-header__lead">{t('home.lead')}</p>
        </div>
      </header>

      <div className="dash">
        <div className="dash__main">
          <MyCircles />
          <section className="panel" aria-labelledby="today-title">
            <div className="panel__head">
              <h2 id="today-title" className="panel__title">{t('landing.teaser.title')}</h2>
            </div>
            <div className="panel__body">
              <IcebreakerCard bare />
            </div>
          </section>
        </div>
        <div className="dash__side">
          {circles.data?.length === 0 ? <FirstTour /> : null}
          <KeepersSummary />
        </div>
      </div>
    </div>
  )
}
