import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ArrowRight, ChevronRight, Heart, Plus } from 'lucide-react'
import { useMe } from '../../api/hooks'
import { useFavourites } from '../../api/sparks'
import { useMyCircles, type CircleSummary } from '../../api/circles'
import { useDocumentTitle } from '../../app/locale'
import { ButtonLink } from '../../components/Button'
import { FaceMark } from '../../components/Brand'
import { Character } from '../../components/Character'
import { Meter, type MeterTone } from '../../components/Meter'
import { MoodScale } from '../../components/MoodScale'
import type { Mood } from '../../components/MoodIcon'
import { TourVideo } from '../../components/TourVideo'
import { useDeckStore } from '../../stores/deck'
import { enterVariants, listVariants, rowVariants, useReducedMotion } from '../../lib/motion'
import { IcebreakerCard } from '../landing/IcebreakerCard'
import '../../styles/app.css'
import '../../styles/circles.css'

const PHASE_KEY = () => `circloo-phase-${new Date().toISOString().slice(0, 10)}`
const readPhase = (): Mood | null => {
  try {
    const v = Number(localStorage.getItem(PHASE_KEY()))
    return v >= 1 && v <= 5 ? (v as Mood) : null
  } catch {
    return null
  }
}
const moodTone = (mood: Mood): MeterTone => (mood >= 4 ? 'ok' : mood === 3 ? 'mid' : 'low')

/** The cast on the empty Home: three friends on the ground, waiting for the first circle. */
const CAST = ['fox', 'panda', 'owl'] as const

/** Today's phase: the person's mood, one tap, kept on this device until the circle-wide check-in ships. */
function TodayPhase({ mood, onPick }: { mood: Mood | null; onPick: (m: Mood) => void }) {
  const { t } = useTranslation()
  const word = mood ? t(`landing.feel.moods.${mood}`).toLocaleLowerCase() : null
  return (
    <section className="feel" aria-labelledby="feel-title">
      <h2 id="feel-title" className="feel__title">{t('home.feelTitle')}</h2>
      <MoodScale mood={mood} onPick={onPick} label={t('home.feelTitle')} />
      <p className="feel__weather" aria-live="polite">
        {word ? <Trans i18nKey="home.weather" values={{ mood: word }} components={{ b: <strong /> }} /> : t('landing.feel.tryIt')}
      </p>
      <p className="feel__note">{t('home.phaseNote')}</p>
    </section>
  )
}

/** The lead circle: the newest open one, as the view's dark card with its people as buddy rows and one meter. */
function LeadCard({ circle, mood }: { circle: CircleSummary; mood: Mood | null }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const here = circle.bodies.length
  const word = mood ? t(`landing.feel.moods.${mood}`).toLocaleLowerCase() : null
  return (
    <motion.section className="panel panel--dark lead" aria-labelledby="lead-title" variants={enterVariants(reduced)} initial="hidden" animate="show">
      <div className="panel__head">
        <h2 id="lead-title" className="panel__title">
          <bdi>{circle.name}</bdi>
          <span className="lozenge lozenge--success">{t('circles.status.live')}</span>
        </h2>
      </div>
      <div className="panel__body">
        <motion.ul className="lead__people" variants={listVariants(reduced, 0.05)} initial="hidden" animate="show">
          {circle.bodies.map((b) => (
            <motion.li key={b.id} className="buddy" variants={rowVariants(reduced)}>
              <span className="buddy__char"><Character id={b.character} ring={b.ring} tag={false} /></span>
              <span className="buddy__text">
                <span className="buddy__name">
                  <bdi>{b.name}</bdi>
                  {b.me ? <span className="buddy__you"> ({t('circles.you')})</span> : null}
                </span>
                <span className="buddy__status">{b.me ? t(`circles.roles.${circle.role}`) : t('home.here')}</span>
              </span>
              <span className={`buddy__value is-${b.me && mood ? moodTone(mood) : 'ok'}`}>{b.me && word ? word : t('home.here')}</span>
            </motion.li>
          ))}
        </motion.ul>
        <div className="lead__meter">
          <p className="lead__count">
            <strong>{t('home.hereOf', { value: here, max: circle.people })}</strong>
            <span>{t('home.hereToday')}</span>
          </p>
          <Meter value={here} max={circle.people} label={t('home.hereToday')} />
        </div>
      </div>
      <div className="panel__actions">
        <ButtonLink to={`/app/circles/${circle.id}`} size="lg" className="lead__open" icon={<ArrowRight className="flip-rtl" size={18} />}>
          {t('home.openRoom')}
        </ButtonLink>
      </div>
    </motion.section>
  )
}

/** The other circles as outlined rows: name, what it is, who is in it, and the way in. */
function CircleRows({ circles, title }: { circles: CircleSummary[]; title: string }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  return (
    <section className="circles" aria-labelledby="circles-title">
      <div className="circles__head">
        <h2 id="circles-title" className="circles__title">{title}</h2>
        <span className="circles__count" aria-hidden="true">{circles.length}</span>
      </div>
      <motion.ul className="circle-list" variants={listVariants(reduced, 0.05)} initial="hidden" animate="show">
        {circles.map((c) => {
          const open = c.status === 'open'
          return (
            <motion.li key={c.id} className={`circle-list__item${open ? '' : ' is-closed'}`} variants={rowVariants(reduced)}>
              <Link className="circle-list__link" to={`/app/circles/${c.id}`} viewTransition>
                <span className="circle-list__text">
                  <span className="circle-list__name"><bdi>{c.name}</bdi></span>
                  <span className="circle-list__meta">
                    {open ? null : <span className="lozenge">{t('circles.status.closed')}</span>}
                    {t(`circles.roles.${c.role}`)} · {t('circles.people', { count: c.people })}
                  </span>
                </span>
                <span className="stack" aria-hidden="true">
                  {c.bodies.slice(0, 4).map((b) => <Character key={b.id} id={b.character} tag={false} />)}
                </span>
                <ChevronRight className="circle-list__go flip-rtl" size={20} aria-hidden="true" />
              </Link>
            </motion.li>
          )
        })}
      </motion.ul>
    </section>
  )
}

/** Before the first circle: a headline, the cast on the ground, one pill. */
function EmptyHome() {
  const { t } = useTranslation()
  return (
    <section className="circles-empty" aria-labelledby="empty-title">
      <div className="circles-empty__cast" aria-hidden="true">
        {CAST.map((c) => <span key={c} className="ground"><Character id={c} tag={false} /></span>)}
      </div>
      <h2 id="empty-title" className="circles-empty__title">{t('home.firstTitle')}</h2>
      <p className="circles-empty__body">{t('circles.mine.emptyBody')}</p>
      <ButtonLink to="/app/circles/new" size="lg" icon={<Plus size={18} strokeWidth={2.5} />}>{t('circles.mine.create')}</ButtonLink>
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
        <p className="field__error panel__empty" role="alert">{t('common.errorGeneric')}</p>
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
  const [mood, setMood] = useState<Mood | null>(readPhase)
  const pick = (m: Mood) => {
    setMood(m)
    try {
      localStorage.setItem(PHASE_KEY(), String(m))
    } catch {
      /* private mode: the phase lives for this visit only */
    }
  }

  // Open circles first, the newest open one leads; closed ones follow, newest first.
  const list = [...(circles.data ?? [])].sort(
    (a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.createdAt.localeCompare(a.createdAt),
  )
  const lead = list[0]?.status === 'open' ? list[0] : null
  const others = lead ? list.slice(1) : list
  const empty = circles.isSuccess && list.length === 0

  return (
    <div className="page">
      <header className="hello">
        <FaceMark mood={mood ?? 5} interactive className="hello__face" />
        <div className="hello__text">
          <h1 className="page-header__title">
            <Trans i18nKey="home.greeting" values={{ name: me?.displayName ?? '' }} components={{ name: <bdi /> }} />
          </h1>
          <p className="page-header__lead">
            {lead ? t('home.liveLine', { name: lead.name, count: lead.people }) : t('home.lead')}
          </p>
        </div>
      </header>

      <div className="home-grid" data-perch="circles">
        <div className="home-grid__main">
          {circles.isPending ? (
            <p className="panel__empty" role="status">{t('common.loading')}</p>
          ) : circles.isError ? (
            <p className="field__error panel__empty" role="alert">{t('common.errorGeneric')}</p>
          ) : empty ? (
            <EmptyHome />
          ) : (
            <>
              {lead ? <LeadCard circle={lead} mood={mood} /> : null}
              {others.length > 0 ? <CircleRows circles={others} title={lead ? t('home.otherCircles') : t('circles.mine.title')} /> : null}
            </>
          )}
          {empty ? (
            <section className="panel" aria-labelledby="today-title">
              <div className="panel__head">
                <h2 id="today-title" className="panel__title">{t('landing.teaser.title')}</h2>
              </div>
              <div className="panel__body">
                <IcebreakerCard bare />
              </div>
            </section>
          ) : null}
        </div>
        <aside className="home-grid__side">
          {empty ? <FirstTour /> : <TodayPhase mood={mood} onPick={pick} />}
          {empty ? null : (
            <section className="panel" aria-labelledby="today-title">
              <div className="panel__head">
                <h2 id="today-title" className="panel__title">{t('landing.teaser.title')}</h2>
              </div>
              <div className="panel__body">
                <IcebreakerCard bare />
              </div>
            </section>
          )}
          <KeepersSummary />
        </aside>
      </div>
    </div>
  )
}
