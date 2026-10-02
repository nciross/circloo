import { useId, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, FileUp, Loader2, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import {
  ACCEPT, MAX_UPLOAD_BYTES, errorKey, useDeletePresentation, usePresentations, useUpload, type PresentationSummary,
} from '../../api/presentations'
import { useDocumentTitle } from '../../app/locale'
import { Button } from '../../components/Button'
import { Character } from '../../components/Character'
import { Loading } from '../../components/Loading'
import { PageHeader } from '../../components/PageHeader'
import '../../styles/app.css'
import '../../styles/presentations.css'

/** Drop zone and file button: one .pptx at a time, checked for size before anything is sent. */
function Uploader() {
  const { t } = useTranslation()
  const upload = useUpload()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hintId = useId()

  const send = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t('presentations.errors.too-large'))
      return
    }
    setProgress(0)
    try {
      await upload.mutateAsync({ file, onProgress: setProgress })
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError(t('presentations.errors.rate-limited'))
      else setError(t(errorKey(err instanceof ApiError ? err.type : null)))
    } finally {
      setProgress(null)
      if (input.current) input.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void send(e.dataTransfer.files[0])
  }

  const busy = progress !== null
  return (
    <div className="deck-upload">
      <div
        className={['deck-drop', over ? 'is-over' : '', busy ? 'is-busy' : ''].filter(Boolean).join(' ')}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <FileUp size={28} aria-hidden="true" className="deck-drop__icon" />
        <p className="deck-drop__title">{t('presentations.upload.title')}</p>
        <p className="deck-drop__hint" id={hintId}>{t('presentations.upload.hint')}</p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void send(e.target.files?.[0])}
        />
        <Button variant="default" icon={<FileUp size={16} />} busy={busy} aria-describedby={hintId} onClick={() => input.current?.click()}>
          {t('presentations.upload.choose')}
        </Button>
        {busy ? (
          <div className="deck-drop__progress" role="progressbar" aria-label={t('presentations.upload.sending')}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
            <span style={{ inlineSize: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        ) : null}
      </div>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
    </div>
  )
}

function Status({ deck }: { deck: PresentationSummary }) {
  const { t } = useTranslation()
  if (deck.status === 'processing') {
    return (
      <span className="lozenge lozenge--info deck-card__status">
        <Loader2 size={12} aria-hidden="true" className="spin" />
        {t('presentations.converting', { done: deck.processedSlides, total: deck.slideCount })}
      </span>
    )
  }
  if (deck.status === 'failed') {
    return <span className="lozenge lozenge--danger deck-card__status">{t('presentations.failed')}</span>
  }
  return null
}

function DeckCard({ deck }: { deck: PresentationSummary }) {
  const { t } = useTranslation()
  const remove = useDeletePresentation()
  const [confirming, setConfirming] = useState(false)
  const titleId = useId()
  return (
    <li className="deck-card" aria-labelledby={titleId}>
      <Link to={`/app/presentations/${deck.id}`} className="deck-card__link" viewTransition>
        <span className="deck-card__thumb">
          {deck.thumbnail ? <img src={deck.thumbnail} alt="" loading="lazy" width={480} height={270} /> : null}
        </span>
        <span className="deck-card__body">
          <span id={titleId} className="deck-card__name" dir="auto">{deck.name}</span>
          <span className="deck-card__meta">
            {t('presentations.slides', { count: deck.slideCount })}
            {deck.questionCount ? ` · ${t('presentations.questions', { count: deck.questionCount })}` : ''}
          </span>
        </span>
      </Link>
      <div className="deck-card__foot">
        <Status deck={deck} />
        {deck.status === 'failed' ? <span className="deck-card__why">{t(errorKey(deck.error))}</span> : null}
        {deck.deletesInDays !== null ? (
          <span className="lozenge lozenge--warning">
            <AlertTriangle size={12} aria-hidden="true" /> {t('presentations.deletesIn', { count: deck.deletesInDays })}
          </span>
        ) : null}
        <span className="deck-card__actions">
          {confirming ? (
            <>
              <span className="deck-card__confirm">{t('presentations.deleteConfirm')}</span>
              <Button size="sm" variant="subtle" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
              <Button size="sm" variant="danger" busy={remove.isPending} onClick={() => remove.mutate(deck.id)}>{t('presentations.delete')}</Button>
            </>
          ) : (
            <Button size="sm" variant="subtle" icon={<Trash2 size={14} />} aria-label={t('presentations.deleteNamed', { name: deck.name })}
              onClick={() => setConfirming(true)} />
          )}
        </span>
      </div>
    </li>
  )
}

/** The animator's presentations: upload a PowerPoint, see it convert, open it to add questions (spec 006 US1). */
export default function Library() {
  const { t } = useTranslation()
  useDocumentTitle('presentations.title')
  const list = usePresentations()
  if (list.isPending) return <Loading />
  const decks = list.data ?? []
  return (
    <div className="page">
      <PageHeader crumbs={[{ to: '/app', label: t('common.nav.home') }]} title={t('presentations.title')} lead={t('presentations.lead')} />
      <Uploader />
      {list.isError ? <p className="field__error" role="alert">{t('common.errorGeneric')}</p> : null}
      {decks.length === 0 ? (
        <div className="deck-empty">
          <Character id="owl" className="deck-empty__char" />
          <p className="deck-empty__title">{t('presentations.empty.title')}</p>
          <p className="field__help">{t('presentations.empty.body')}</p>
        </div>
      ) : (
        <ul className="deck-grid">
          {decks.map((d) => <DeckCard key={d.id} deck={d} />)}
        </ul>
      )}
    </div>
  )
}
