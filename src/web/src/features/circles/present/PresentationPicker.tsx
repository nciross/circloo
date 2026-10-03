import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Play, RotateCw } from 'lucide-react'
import { usePresentations } from '../../../api/presentations'
import { Button } from '../../../components/Button'
import { Loading } from '../../../components/Loading'
import { useRoom } from '../room'

/** The animator picks one of their ready presentations to start (spec 006 US3 #1); decks still converting are listed, not startable. */
export function PresentationPicker({ onBack, onStarted }: { onBack?: () => void; onStarted?: () => void }) {
  const { t } = useTranslation()
  const list = usePresentations()
  const error = useRoom((s) => s.error)
  const [starting, setStarting] = useState<string | null>(null)
  const shown = (list.data ?? []).filter((p) => p.status !== 'failed')

  const present = async (id: string) => {
    setStarting(id)
    useRoom.getState().clearError()
    try {
      await useRoom.getState().startPresentation(id)
      onStarted?.()
    } catch {
      // The room shows the error code.
    } finally {
      setStarting(null)
    }
  }

  return (
    <section className="panel picker" aria-labelledby="picker-title">
      <div className="panel__head">
        <h2 id="picker-title" className="panel__title">{t('present.pickTitle')}</h2>
        {onBack ? <Button size="sm" variant="subtle" icon={<ArrowLeft size={14} className="flip-rtl" />} onClick={onBack}>{t('present.back')}</Button> : null}
      </div>
      <div className="panel__body">
        <p className="field__help">{t('present.pickBody')}</p>
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <div className="picker__empty">
            <p className="field__error" role="alert">{t('present.listFailed')}</p>
            <Button size="sm" variant="default" icon={<RotateCw size={14} />} onClick={() => void list.refetch()}>{t('present.retry')}</Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="picker__empty">
            {t('present.pickEmpty')} <Link to="/app/presentations">{t('present.pickLibrary')}</Link>
          </p>
        ) : (
          <ul className="picker__list">
            {shown.map((p) => (
              <li key={p.id} className="picker__item">
                <span className="picker__thumb" aria-hidden="true">{p.thumbnail ? <img src={p.thumbnail} alt="" width={160} height={90} loading="lazy" /> : null}</span>
                <span className="picker__text">
                  <span className="picker__name" dir="auto">{p.name}</span>
                  <span className="field__help">
                    {p.status === 'processing'
                      ? t('present.converting')
                      : t('presentations.slides', { count: p.slideCount }) + (p.questionCount ? ` · ${t('presentations.questions', { count: p.questionCount })}` : '')}
                  </span>
                </span>
                {p.status === 'ready' ? (
                  <Button size="sm" className="picker__present" icon={<Play size={14} />} busy={starting === p.id}
                    aria-label={t('present.presentNamed', { name: p.name })} onClick={() => present(p.id)}>
                    {t('present.present')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="field__error" role="alert">{t(`circles.errors.${error}`, { defaultValue: t('circles.errors.failed') })}</p> : null}
      </div>
    </section>
  )
}
