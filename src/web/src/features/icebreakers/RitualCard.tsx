import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Heart, Shuffle } from 'lucide-react'
import { drawSpark, useToggleFavourite, type DrawResult, type Spark } from '../../api/sparks'
import { useDeckStore } from '../../stores/deck'
import { useUiStore } from '../../stores/ui'
import { MagnetButton } from '../../components/Magnet'

function shakeDoor() {
  document.documentElement.classList.add('is-shaking')
  window.setTimeout(() => document.documentElement.classList.remove('is-shaking'), 520)
}

function RiddleAnswer({ answer, lang }: { answer: string; lang: string }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  return shown ? (
    <p className="ritual-card__answer" lang={lang}>{answer}</p>
  ) : (
    <button type="button" className="text-link ritual-card__reveal" onClick={() => setShown(true)}>
      {t('ice.card.showAnswer')}
    </button>
  )
}

/** The big card of the ritual: each shake deals the next spark that matches the filter magnets. */
export function RitualCard({ big = false }: { big?: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const locale = useUiStore((s) => s.locale)
  const { audience, tone, kind, kidsSafe, deal, pinned, shake, pin } = useDeckStore()
  const favourite = useToggleFavourite()
  const [shaken, setShaken] = useState(false)

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
    shakeDoor()
    setShaken(true)
    shake()
  }

  const toggleFav = (s: Spark) => {
    const on = !s.favourite
    const apply = (value: boolean) => {
      if (pinned?.id === s.id) pin({ ...pinned, favourite: value })
      else qc.setQueryData<DrawResult>(key, (d) => (d?.spark ? { ...d, spark: { ...d.spark, favourite: value } } : d))
    }
    apply(on)
    favourite.mutate({ id: s.id, on }, { onError: () => apply(!on) })
  }

  const loading = !pinned && draw.isFetching
  return (
    <article className={`ritual-card${big ? ' ritual-card--big' : ''}`} aria-label={t('ice.card.label')}>
      <span className="pin-magnet pin-magnet--cobalt" aria-hidden="true" />
      <p className="visually-hidden" aria-live="polite">{shaken && current ? current.text : ''}</p>
      {current?.source === 'ai' ? <span className="fresh-stamp">{t('ice.card.fresh')}</span> : null}
      <div className="ritual-card__body">
        {!pinned && draw.isError ? (
          <p className="ritual-card__message" role="alert">{t('ice.card.error')}</p>
        ) : current ? (
          <h2 key={current.id} className="ritual-card__question is-dealt" lang={current.lang}>{current.text}</h2>
        ) : draw.isPending || loading ? (
          <p className="ritual-card__message">{t('common.loading')}</p>
        ) : (
          <p className="ritual-card__message">{t('ice.card.empty')}</p>
        )}
        {current?.kind === 'riddle' && current.answer ? <RiddleAnswer key={current.id} answer={current.answer} lang={current.lang} /> : null}
        {!pinned && draw.data?.exhausted ? <p className="ritual-card__note">{t('ice.card.exhausted')}</p> : null}
      </div>
      <div className="ritual-card__actions">
        <MagnetButton color="sunflower" size="lg" icon={<Shuffle size={20} strokeWidth={2.5} />} onClick={onShake} busy={loading}>
          {t('ice.card.shake')}
        </MagnetButton>
        {current ? (
          <button
            type="button"
            className="heart-magnet"
            aria-pressed={current.favourite}
            aria-label={current.favourite ? t('ice.card.unfavourite') : t('ice.card.favourite')}
            onClick={() => toggleFav(current)}
          >
            <Heart size={22} strokeWidth={2.5} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </article>
  )
}
