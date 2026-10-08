import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ChevronRight, Crown, Heart, Plus, UsersRound } from 'lucide-react'
import { useMe } from '../../api/hooks'
import { useFavourites } from '../../api/sparks'
import { useMyCircles, type CircleSummary, type Role } from '../../api/circles'
import { useDocumentTitle } from '../../app/locale'
import { ButtonLink } from '../../components/Button'
import { FaceMark } from '../../components/Brand'
import { Character } from '../../components/Character'
import { MoodScale } from '../../components/MoodScale'
import type { Mood } from '../../components/MoodIcon'
import { TourVideo } from '../../components/TourVideo'
import { useDeckStore } from '../../stores/deck'
import { keepPrompt } from '../../lib/circlePrompt'
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

/** The cast on the create card: three friends waiting for the next circle. */
const CAST = ['fox', 'panda', 'owl'] as const
/** Quick starts: each hands a line to the new-circle page, which fills the form from it ("Describe it"). */
const QUICK = [
  { id: 'family', tone: 'mint' },
  { id: 'friends', tone: 'butter' },
  { id: 'team', tone: 'lavender' },
] as const

/** Today's phase: the person's mood, one tap, kept on this device until the circle-wide check-in ships. */
function TodayPhase({ mood, onPick }: { mood: Mood | null; onPick: (m: Mood) => void }) {
  const { t } = useTranslation()
  const word = mood ? t(`landing.feel.moods.${mood}`).toLocaleLowerCase() : null
  return (
    <section className="panel feel" aria-labelledby="feel-title">
      <h2 id="feel-title" className="feel__title">{t('home.feelTitle')}</h2>
      <MoodScale mood={mood} onPick={onPick} label={t('home.feelTitle')} />
      <p className="feel__weather" aria-live="polite">
        {word ? <Trans i18nKey="home.weather" values={{ mood: word }} components={{ b: <strong /> }} /> : t('landing.feel.tryIt')}
      </p>
      <p className="feel__note">{t('home.phaseNote')}</p>
    </section>
  )
}

/**
 * Start a circle, on a light mauve card (the founder preferred it to black): the title and one line, the charcoal pill,
 * three quick starts that hand a line to the new-circle page, and the cast waiting at the end.
 */
function CreateCard({ first }: { first: boolean }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  return (
    <motion.section className="panel create-card" aria-labelledby="create-title" variants={enterVariants(reduced)} initial="hidden" animate="show">
      <div className="create-card__copy">
        <h2 id="create-title" className="create-card__title">{t(first ? 'home.firstTitle' : 'home.create.title')}</h2>
        <p className="create-card__lead">{t('home.create.lead')}</p>
        <ButtonLink to="/app/circles/new" size="lg" className="create-card__go" icon={<Plus size={18} strokeWidth={2.5} />}>
          {t(first ? 'circles.mine.create' : 'home.create.cta')}
        </ButtonLink>
        <div className="create-card__quick">
          <p className="create-card__quick-label" id="quick-label">{t('home.create.quick')}</p>
          <ul className="create-card__chips" aria-labelledby="quick-label">
            {QUICK.map((q) => (
              <li key={q.id}>
                <Link
                  to="/app/circles/new"
                  className={`quick quick--${q.tone}`}
                  onClick={() => keepPrompt(t(`home.create.lines.${q.id}`))}
                  viewTransition
                >
                  {t(`home.create.kinds.${q.id}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="create-card__cast" aria-hidden="true">
        {CAST.map((c) => <span key={c} className="ground"><Character id={c} tag={false} /></span>)}
      </div>
    </motion.section>
  )
}

/** One group of circles, by the role the person has in them: rows with the name, live or closed, people, the way in. */
function CircleGroup({ role, circles }: { role: Role; circles: CircleSummary[] }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const Icon = role === 'animator' ? Crown : UsersRound
  const id = `circles-${role}`
  return (
    <section className={`circles circles--${role}`} aria-labelledby={id}>
      <div className="circles__head">
        <span className={`circles__icon circles__icon--${role}`} aria-hidden="true"><Icon size={18} strokeWidth={2.25} /></span>
        <h3 id={id} className="circles__title">{t(`home.groups.${role}.title`)}</h3>
        <span className="circles__count" aria-hidden="true">{circles.length}</span>
      </div>
      {circles.length === 0 ? (
        <p className="circles__empty">{t(`home.groups.${role}.empty`)}</p>
      ) : (
        <motion.ul className="circle-list" variants={listVariants(reduced, 0.05)} initial="hidden" animate="show">
          {circles.map((c) => {
            const open = c.status === 'open'
            return (
              <motion.li key={c.id} className={`circle-list__item${open ? ' is-open' : ' is-closed'}`} variants={rowVariants(reduced)}>
                <Link className="circle-list__link" to={`/app/circles/${c.id}`} viewTransition>
                  <span className="circle-list__text">
                    <span className="circle-list__name"><bdi>{c.name}</bdi></span>
                    <span className="circle-list__meta">
                      <span className={`lozenge${open ? ' lozenge--success' : ''}`}>{t(open ? 'circles.status.live' : 'circles.status.closed')}</span>
                      {t('circles.people', { count: c.people })}
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
      )}
    </section>
  )
}

/** My circles: the ones the person runs and the ones they joined, side by side on wide screens. */
function MyCircles({ circles }: { circles: CircleSummary[] }) {
  const { t } = useTranslation()
  return (
    <section className="mine" aria-labelledby="mine-title">
      <h2 id="mine-title" className="mine__title">{t('circles.mine.title')}</h2>
      <div className="mine__groups">
        <CircleGroup role="animator" circles={circles.filter((c) => c.role === 'animator')} />
        <CircleGroup role="participant" circles={circles.filter((c) => c.role === 'participant')} />
      </div>
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

/**
 * Home (#250, charcoal): two things lead. Start a circle, on a light mauve card, and My circles, split by
 * the person's role: the circles they run and the circles they joined. Today's mood, the icebreaker of the day and
 * the favourites sit beside, secondary.
 */
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

  // Open circles first, newest first; closed ones follow, newest first.
  const list = [...(circles.data ?? [])].sort(
    (a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.createdAt.localeCompare(a.createdAt),
  )
  const live = list.find((c) => c.status === 'open')
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
            {live ? t('home.liveLine', { name: live.name, count: live.people }) : t('home.lead')}
          </p>
        </div>
      </header>

      <div className="home-grid" data-perch="circles">
        <div className="home-grid__main">
          <CreateCard first={empty} />
          {circles.isPending ? (
            <p className="panel__empty" role="status">{t('common.loading')}</p>
          ) : circles.isError ? (
            <p className="field__error panel__empty" role="alert">{t('common.errorGeneric')}</p>
          ) : empty ? (
            <section className="circles-empty" aria-labelledby="empty-title">
              <h2 id="empty-title" className="circles-empty__title">{t('circles.mine.emptyTitle')}</h2>
              <p className="circles-empty__body">{t('circles.mine.emptyBody')}</p>
            </section>
          ) : (
            <MyCircles circles={list} />
          )}
        </div>
        <aside className="home-grid__side">
          {empty ? <FirstTour /> : <TodayPhase mood={mood} onPick={pick} />}
          <section className="panel" aria-labelledby="today-title">
            <div className="panel__head">
              <h2 id="today-title" className="panel__title">{t('landing.teaser.title')}</h2>
            </div>
            <div className="panel__body">
              <IcebreakerCard bare />
            </div>
          </section>
          <KeepersSummary />
        </aside>
      </div>
    </div>
  )
}
