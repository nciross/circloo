import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Heart, Shuffle } from 'lucide-react'
import { motion } from 'motion/react'
import { drawSpark, useToggleFavourite, type DrawResult, type Spark } from '../../api/sparks'
import { useDeckStore } from '../../stores/deck'
import { useUiStore } from '../../stores/ui'
import { Button } from '../../components/Button'
import { dur, spring, useReducedMotion } from '../../lib/motion'

export function RiddleAnswer({ answer, lang }: { answer: string; lang: string }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  return shown ? (
    <p className="deal__answer" lang={lang} dir="auto">{answer}</p>
  ) : (
    <button type="button" className="link-btn deal__reveal" onClick={() => setShown(true)}>
      {t('ice.card.showAnswer')}
    </button>
  )
}

/** The big card of the ritual: each deal brings the next spark that matches the filters. */
export function RitualCard({ big = false }: { big?: boolean }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const locale = useUiStore((s) => s.locale)
  const { audience, tone, kind, kidsSafe, deal, pinned, shake, pin } = useDeckStore()
  const favourite = useToggleFavourite()
  const reduced = useReducedMotion()
  const [shaken, setShaken] = useState(false)
  const [favFailed, setFavFailed] = useState(false)
  const [dealing, setDealing] = useState(false)

  const key = ['draw', locale, audience, tone, kind, kidsSafe, deal] as const
  const draw = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const r = await drawSpark({ lang: locale, audience, tone, kind, kidsSafe }, useDeckStore.getState().seen, signal)
      useDeckStore.getState().dealt(r.spark, r.exhausted)
      return r
    },
    staleTime: Infinity,
    gcTime: 60_000,
    retry: 1,
  })

  const current: Spark | null = pinned ?? draw.data?.spark ?? null

  const onShake = () => {
    setShaken(true)
    shake()
  }

  const toggleFav = (s: Spark) => {
    const on = !s.favourite
    const apply = (value: boolean) => {
      if (pinned?.id === s.id) pin({ ...pinned, favourite: value })
      else qc.setQueryData<DrawResult>(key, (d) => (d?.spark ? { ...d, spark: { ...d.spark, favourite: value } } : d))
    }
    setFavFailed(false)
    apply(on)
    favourite.mutate({ id: s.id, on }, { onError: () => { apply(!on); setFavFailed(true) } })
  }

  const loading = !pinned && draw.isFetching

  // The focal moment: a dealt card drops onto the deck from a slight tilt (mirrored in RTL) and
  // settles with the soft spring; under reduced motion it simply appears.
  const tilt = i18n.dir() === 'rtl' ? 2 : -2
  const dealIn = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: dur.state } }
    : { initial: { opacity: 0, y: -18, rotate: tilt }, animate: { opacity: 1, y: 0, rotate: 0 }, transition: spring.soft }

  return (
    <div className={`deck${dealing ? ' is-dealing' : ''}`}>
      {/* The one dark card of the page: the card on the table. Everything on it reads in --on-card. */}
      <article className={`panel panel--dark deal${big ? ' deal--big' : ''}`} aria-labelledby="deal-title">
        <div className="panel__head">
          <h2 id="deal-title" className="panel__title">{t('ice.card.label')}</h2>
          <div className="deal__meta">
            {current?.source === 'ai' ? <span className="lozenge lozenge--ai">{t('ice.card.fresh')}</span> : null}
            {current ? <span className="lozenge">{t(`ice.filters.kinds.${current.kind}`)}</span> : null}
            {current ? <span className="lozenge" lang={current.lang}>{t(`common.languages.${current.lang}`)}</span> : null}
          </div>
        </div>
        <p className="visually-hidden" aria-live="polite" lang={current?.lang}>
          {pinned ? t('ice.card.pinned', { text: pinned.text }) : shaken && current ? current.text : ''}
        </p>
        {favFailed ? <p className="field__error deal__error" role="alert">{t('ice.card.favouriteFailed')}</p> : null}
        <motion.div
          key={current?.id ?? (draw.isError ? 'error' : 'empty')}
          className="deal__body"
          {...dealIn}
          onAnimationStart={() => setDealing(true)}
          onAnimationComplete={() => setDealing(false)}
        >
          {!pinned && draw.isError ? (
            <p className="deal__message" role="alert">{t('ice.card.error')}</p>
          ) : current ? (
            <p className="deal__question is-dealt" lang={current.lang} dir="auto">{current.text}</p>
          ) : draw.isPending || loading ? (
            <p className="deal__message">{t('common.loading')}</p>
          ) : (
            <p className="deal__message">{t('ice.card.empty')}</p>
          )}
          {current?.kind === 'riddle' && current.answer ? <RiddleAnswer key={current.id} answer={current.answer} lang={current.lang} /> : null}
          {!pinned && draw.data?.exhausted ? <p className="deal__note">{t('ice.card.exhausted')}</p> : null}
        </motion.div>
        <div className="deal__actions">
          <Button size="lg" icon={<Shuffle size={18} strokeWidth={2.25} />} onClick={onShake} busy={loading}>
            {t('ice.card.shake')}
          </Button>
          {current ? (
            <button
              type="button"
              className="heart"
              aria-pressed={current.favourite}
              aria-label={t('ice.card.favourite')}
              onClick={() => toggleFav(current)}
            >
              <Heart size={20} strokeWidth={2.25} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </article>
    </div>
  )
}
