import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Shuffle } from 'lucide-react'
import { fetchRandomSpark, type PublicSpark } from '../../api/hooks'
import { useUiStore } from '../../stores/ui'
import { Button } from '../../components/Button'

/**
 * A real seed icebreaker. "Deal another" brings the next one in the current language. The visitor
 * can type an answer on the card (never sent anywhere). `bare` drops the card's own title and frame
 * when it sits inside a panel that already names it.
 */
export function IcebreakerCard({ bare = false }: { bare?: boolean }) {
  const { t } = useTranslation()
  const locale = useUiStore((s) => s.locale)
  const qc = useQueryClient()
  const [dealing, setDealing] = useState(false)
  const [answer, setAnswer] = useState('')
  const [announce, setAnnounce] = useState('')

  const key = ['spark', locale] as const
  const spark = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchRandomSpark(locale, undefined, signal),
    staleTime: Infinity,
  })

  const deal = async () => {
    setDealing(true)
    try {
      const next = await fetchRandomSpark(locale, spark.data?.id)
      qc.setQueryData<PublicSpark>(key, next)
      setAnswer('')
      setAnnounce(next.text)
    } catch {
      await qc.invalidateQueries({ queryKey: key })
    } finally {
      setDealing(false)
    }
  }

  const Question = bare ? 'p' : 'h2'
  return (
    <article className={`teaser${bare ? ' teaser--bare' : ''}`} aria-label={t('landing.teaser.title')}>
      {bare ? null : (
        <div className="teaser__head" aria-hidden="true">
          <span className="teaser__label">{t('landing.teaser.title')}</span>
          {spark.data ? <span className="lozenge lozenge--info">{t(`ice.filters.kinds.${spark.data.kind}`)}</span> : null}
        </div>
      )}
      <p className="visually-hidden" aria-live="polite">{announce}</p>
      <div className="teaser__body">
        {spark.isPending ? (
          <p className="teaser__question teaser__question--wait">{t('common.loading')}</p>
        ) : spark.isError || !spark.data ? (
          <Question className="teaser__question">{t('landing.teaser.error')}</Question>
        ) : (
          <Question key={spark.data.id} className="teaser__question is-dealt" lang={spark.data.lang}>
            {spark.data.text}
          </Question>
        )}
      </div>
      <label className="teaser__answer">
        <span className="visually-hidden">{t('landing.teaser.answerLabel')}</span>
        <input
          type="text"
          value={answer}
          maxLength={120}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={t('landing.teaser.answerPlaceholder')}
          autoComplete="off"
          dir="auto"
        />
      </label>
      <div className="teaser__foot">
        <span className="teaser__hint">{t('landing.teaser.answerHint')}</span>
        <Button variant="default" size="sm" icon={<Shuffle size={16} strokeWidth={2.25} />} onClick={deal} busy={dealing}>
          {dealing ? t('landing.teaser.shaking') : t('landing.teaser.shake')}
        </Button>
      </div>
    </article>
  )
}
