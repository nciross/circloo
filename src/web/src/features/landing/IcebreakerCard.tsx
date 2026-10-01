import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Shuffle } from 'lucide-react'
import { fetchRandomSpark, type PublicSpark } from '../../api/hooks'
import { useUiStore } from '../../stores/ui'
import { MagnetButton } from '../../components/Magnet'

/**
 * A real seed icebreaker on an index card. "Shake the fridge" shakes the whole door and deals the
 * next card. Browse is author: the visitor can write an answer on the card (never sent anywhere).
 */
export function IcebreakerCard() {
  const { t } = useTranslation()
  const locale = useUiStore((s) => s.locale)
  const qc = useQueryClient()
  const [shaking, setShaking] = useState(false)
  const [answer, setAnswer] = useState('')

  const key = ['spark', locale] as const
  const spark = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchRandomSpark(locale, undefined, signal),
    staleTime: Infinity,
  })

  const shake = async () => {
    setShaking(true)
    document.documentElement.classList.add('is-shaking')
    try {
      const next = await fetchRandomSpark(locale, spark.data?.id)
      qc.setQueryData<PublicSpark>(key, next)
      setAnswer('')
    } catch {
      await qc.invalidateQueries({ queryKey: key })
    } finally {
      window.setTimeout(() => {
        document.documentElement.classList.remove('is-shaking')
        setShaking(false)
      }, 520)
    }
  }

  return (
    <article className="index-card" aria-label={t('landing.teaser.title')}>
      <span className="pin-magnet pin-magnet--cobalt" aria-hidden="true" />
      <p className="index-card__margin" aria-hidden="true">{t('landing.teaser.title')}</p>
      <div className="index-card__body" aria-live="polite">
        {spark.isPending ? (
          <h2 className="index-card__question index-card__question--placeholder">{t('common.loading')}</h2>
        ) : spark.isError || !spark.data ? (
          <h2 className="index-card__question">{t('landing.teaser.error')}</h2>
        ) : (
          <h2 key={spark.data.id} className="index-card__question is-dealt" lang={spark.data.lang}>
            {spark.data.text}
          </h2>
        )}
      </div>
      <label className="index-card__answer">
        <span className="index-card__answer-label">{t('landing.teaser.answerLabel')}</span>
        <input
          type="text"
          value={answer}
          maxLength={120}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={t('landing.teaser.answerPlaceholder')}
          autoComplete="off"
        />
        <span className="index-card__hint">{t('landing.teaser.answerHint')}</span>
      </label>
      <MagnetButton color="sunflower" icon={<Shuffle size={18} strokeWidth={2.5} />} onClick={shake} busy={shaking}>
        {shaking ? t('landing.teaser.shaking') : t('landing.teaser.shake')}
      </MagnetButton>
    </article>
  )
}
