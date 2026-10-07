import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ArrowRight, Heart, Plus } from 'lucide-react'
import { useMe } from '../../api/hooks'
import { useFavourites } from '../../api/sparks'
import { useMyCircles, type CircleSummary } from '../../api/circles'
import { Panda } from '../../components/Panda'
import { useDocumentTitle } from '../../app/locale'
import { ButtonLink } from '../../components/Button'
import { FaceMark } from '../../components/Brand'
import { Ring } from '../../components/Ring'
import { TourVideo } from '../../components/TourVideo'
import { useDeckStore } from '../../stores/deck'
import { listVariants, rowVariants, useReducedMotion } from '../../lib/motion'
import { IcebreakerCard } from '../landing/IcebreakerCard'
import '../../styles/app.css'
import '../../styles/circles.css'

/** One circle as a ring with its people on it; the open ones lead and are larger. */
function CircleRing({ circle, lead }: { circle: CircleSummary; lead: boolean }) {
  const { t } = useTranslation()
  const open = circle.status === 'open'
  return (
    <Link className={`orbit${lead ? ' orbit--lead' : ''}${open ? '' : ' is-closed'}`} to={`/app/circles/${circle.id}`} viewTransition>
      <Ring
        size={lead ? 'lg' : 'sm'}
        bodies={circle.bodies.map((b) => ({ id: b.id, character: b.character, name: b.name, ring: b.ring, me: b.me }))}
        people={circle.people}
        closed={!open}
        compose={lead}
        label={t('circles.ring.label', { name: circle.name, count: circle.people })}
      >
        {lead ? (
          <span className="reading" aria-hidden="true">
            {circle.people}
          </span>
        ) : null}
      </Ring>
      <span className="orbit__text">
        <span className="orbit__name"><bdi>{circle.name}</bdi></span>
        <span className="orbit__meta">
          <span className={`lozenge ${open ? 'lozenge--success' : 'lozenge--neutral'}`}>{t(`circles.status.${circle.status}`)}</span>
          {t(`circles.roles.${circle.role}`)} · {t('circles.people', { count: circle.people })}
        </span>
        <span className="orbit__open" aria-hidden="true">
          <ArrowRight size={16} className="flip-rtl" />
        </span>
      </span>
    </Link>
  )
}

/** The circles you run or joined, as rings: the open ones first, the newest open one largest. */
function MyCircles() {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const circles = useMyCircles()
  const list = [...(circles.data ?? [])].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open'))
  return (
    <section className="orrery" aria-labelledby="circles-title" data-perch="circles">
      <div className="orrery__head">
        <div>
          <h2 id="circles-title" className="orrery__title">{t('home.orrery')}</h2>
          <p className="orrery__lead">{t('home.orreryLead')}</p>
        </div>
        {list.length > 0 ? <ButtonLink to="/app/circles/new" variant="default" icon={<Plus size={16} />}>{t('circles.new')}</ButtonLink> : null}
      </div>
      {circles.isPending ? (
        <p className="panel__empty" role="status">{t('common.loading')}</p>
      ) : circles.isError ? (
        <p className="field__error panel__empty" role="alert">{t('common.errorGeneric')}</p>
      ) : list.length === 0 ? (
        <div className="panel circles-empty">
          <Panda className="circles-empty__panda" />
          <div>
            <p className="circles-empty__title">{t('circles.mine.emptyTitle')}</p>
            <p className="field__help">{t('circles.mine.emptyBody')}</p>
          </div>
          <ButtonLink to="/app/circles/new" icon={<Plus size={16} />}>{t('circles.mine.create')}</ButtonLink>
        </div>
      ) : (
        <motion.ul className="circle-list orbits" variants={listVariants(reduced, 0.06)} initial="hidden" animate="show">
          {list.map((c, i) => (
            <motion.li key={c.id} className="circle-list__item orbits__item" variants={rowVariants(reduced)}>
              <CircleRing circle={c} lead={i === 0 && c.status === 'open'} />
            </motion.li>
          ))}
        </motion.ul>
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

      <MyCircles />

      <div className="dash">
        <div className="dash__main">
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
