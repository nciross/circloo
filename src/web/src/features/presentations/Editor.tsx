import { useEffect, useId, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Info, ListChecks, Loader2, StickyNote, Trash2, Vote, X } from 'lucide-react'
import { ApiError } from '../../api/client'
import { errorKey, usePresentation, useDeleteSlide, useSetHidden, useUpdatePresentation, type PresentationDetail, type SlideView } from '../../api/presentations'
import { useDocumentTitle } from '../../app/locale'
import { Button } from '../../components/Button'
import { Loading } from '../../components/Loading'
import { PageHeader } from '../../components/PageHeader'
import '../../styles/app.css'
import '../../styles/presentations.css'

const NOTE_SEEN = 'circloo.presentations.stillNote'

/** "Animations and media are shown as still pictures": told once per presentation (spec 006 US1 #3). */
function useStillNote(id: string) {
  const [seen, setSeen] = useState(() => {
    try {
      return (JSON.parse(localStorage.getItem(NOTE_SEEN) ?? '[]') as string[]).includes(id)
    } catch {
      return false
    }
  })
  const dismiss = () => {
    setSeen(true)
    try {
      const ids = JSON.parse(localStorage.getItem(NOTE_SEEN) ?? '[]') as string[]
      localStorage.setItem(NOTE_SEEN, JSON.stringify([...ids.filter((x) => x !== id), id].slice(-200)))
    } catch {
      /* private mode: the note simply shows again next time */
    }
  }
  return [!seen, dismiss] as const
}

function Rename({ deck }: { deck: PresentationDetail }) {
  const { t } = useTranslation()
  const update = useUpdatePresentation(deck.id)
  const [name, setName] = useState(deck.name)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    const clean = name.trim()
    // Enter then blur would send the same rename twice.
    if (clean === deck.name || (update.isPending && update.variables?.name === clean)) return
    if (!clean) {
      setError(t('presentations.errors.name-length'))
      return
    }
    setError(null)
    try {
      await update.mutateAsync({ name: clean })
    } catch (err) {
      setError(t(err instanceof ApiError && err.status === 409 ? 'presentations.errors.stale' : 'common.errorGeneric'))
    }
  }

  return (
    <form className="deck-rename" onSubmit={save}>
      <label className="visually-hidden" htmlFor={id}>{t('presentations.name')}</label>
      <input id={id} className="input deck-rename__input" dir="auto" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={() => void save()}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} />
      {error ? <p id={`${id}-err`} className="field__error" role="alert">{error}</p> : null}
    </form>
  )
}

function SlideThumb({ slide, number, selected, onSelect }: { slide: SlideView; number: number; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  const question = slide.kind !== 'deck'
  return (
    <button type="button" className={['slide-thumb', selected ? 'is-selected' : '', slide.hidden ? 'is-hidden' : '', question ? 'is-question' : ''].filter(Boolean).join(' ')}
      aria-current={selected ? 'true' : undefined} onClick={onSelect}
      aria-label={t('presentations.slideLabel', { number, state: slide.hidden ? t('presentations.hiddenState') : '' }).trim()}>
      <span className="slide-thumb__frame">
        {slide.thumbnail ? <img src={slide.thumbnail} alt="" loading="lazy" width={480} height={270} /> : null}
        {question ? (
          <span className="slide-thumb__question">
            {slide.kind === 'quiz' ? <ListChecks size={18} aria-hidden="true" /> : <Vote size={18} aria-hidden="true" />}
            <span dir="auto">{slide.question}</span>
          </span>
        ) : null}
      </span>
      <span className="slide-thumb__meta">
        <span className="slide-thumb__num">{number}</span>
        {slide.hidden ? <EyeOff size={14} aria-hidden="true" /> : null}
        {slide.notes ? <StickyNote size={14} aria-hidden="true" /> : null}
      </span>
    </button>
  )
}

function Preview({ deck, slide, number }: { deck: PresentationDetail; slide: SlideView; number: number }) {
  const { t } = useTranslation()
  const setHidden = useSetHidden(deck.id)
  const remove = useDeleteSlide(deck.id)
  const [confirming, setConfirming] = useState(false)
  const failure = setHidden.error ?? remove.error
  return (
    <section className="slide-preview" aria-label={t('presentations.slideLabel', { number, state: '' }).trim()}>
      <div className="slide-preview__frame">
        {slide.image ? <img src={slide.image} alt={t('presentations.slideLabel', { number, state: '' }).trim()} width={1920} height={1080} /> : null}
        {slide.kind !== 'deck' ? <p className="slide-preview__question" dir="auto">{slide.question}</p> : null}
      </div>
      <div className="slide-preview__bar">
        {slide.kind === 'deck' ? (
          <Button size="sm" variant="default" icon={slide.hidden ? <Eye size={14} /> : <EyeOff size={14} />} busy={setHidden.isPending}
            onClick={() => setHidden.mutate({ slideId: slide.id, hidden: !slide.hidden })}>
            {slide.hidden ? t('presentations.show') : t('presentations.hide')}
          </Button>
        ) : null}
        {confirming ? (
          <>
            <span className="deck-card__confirm">{t('presentations.deleteSlideConfirm')}</span>
            <Button size="sm" variant="subtle" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button size="sm" variant="danger" busy={remove.isPending} onClick={() => remove.mutate(slide.id)}>{t('presentations.delete')}</Button>
          </>
        ) : (
          <Button size="sm" variant="subtle" icon={<Trash2 size={14} />} onClick={() => setConfirming(true)}>{t('presentations.deleteSlide')}</Button>
        )}
      </div>
      {failure ? (
        <p className="field__error" role="alert">
          {t(failure instanceof ApiError && failure.status === 409 ? 'presentations.errors.stale' : 'common.errorGeneric')}
        </p>
      ) : null}
      <div className="slide-notes">
        <h2 className="slide-notes__title"><StickyNote size={14} aria-hidden="true" /> {t('presentations.notes')}</h2>
        {slide.notes ? <p className="slide-notes__text" dir="auto">{slide.notes}</p> : <p className="field__help">{t('presentations.noNotes')}</p>}
      </div>
    </section>
  )
}

/** One presentation: its slides in order, notes, hide and delete; questions arrive with T606 (spec 006 US1–US2). */
export default function Editor() {
  const { t } = useTranslation()
  useDocumentTitle('presentations.title')
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const query = usePresentation(id)
  const [selected, setSelected] = useState<string | null>(null)
  const [showNote, dismissNote] = useStillNote(id)

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 404) void navigate('/app/presentations', { replace: true })
  }, [query.error, navigate])

  if (query.isPending) return <Loading />
  const deck = query.data
  if (!deck) return <p className="field__error" role="alert">{t('common.errorGeneric')}</p>

  const slides = deck.slides
  const current = slides.find((s) => s.id === selected) ?? slides[0]
  const crumbs = [{ to: '/app', label: t('common.nav.home') }, { to: '/app/presentations', label: t('presentations.title') }]

  return (
    <div className="page deck-editor">
      <PageHeader crumbs={crumbs} title={<Rename key={deck.name} deck={deck} />}
        lead={t('presentations.slides', { count: deck.slideCount }) + (deck.questionCount ? ` · ${t('presentations.questions', { count: deck.questionCount })}` : '')} />

      {deck.status === 'processing' ? (
        <div className="deck-progress" role="status">
          <Loader2 size={16} aria-hidden="true" className="spin" />
          <span>{t('presentations.converting', { done: deck.processedSlides, total: deck.slideCount })}</span>
          <span className="deck-progress__bar" aria-hidden="true">
            <span style={{ inlineSize: `${deck.slideCount ? Math.round((deck.processedSlides / deck.slideCount) * 100) : 0}%` }} />
          </span>
        </div>
      ) : null}
      {deck.status === 'failed' ? <p className="field__error" role="alert">{t(errorKey(deck.error))}</p> : null}
      {deck.status === 'ready' && showNote ? (
        <div className="deck-note" role="note">
          <Info size={16} aria-hidden="true" />
          <p>{t('presentations.stillNote')}</p>
          <button type="button" className="deck-note__close" aria-label={t('common.close')} onClick={dismissNote}><X size={16} aria-hidden="true" /></button>
        </div>
      ) : null}

      {deck.status !== 'failed' && current ? (
        <div className="deck-workspace">
          <ol className="slide-strip" aria-label={t('presentations.strip')}>
            {slides.map((s, i) => (
              <li key={s.id}>
                <SlideThumb slide={s} number={i + 1} selected={s.id === current.id} onSelect={() => setSelected(s.id)} />
              </li>
            ))}
          </ol>
          <Preview key={current.id} deck={deck} slide={current} number={slides.indexOf(current) + 1} />
        </div>
      ) : null}
    </div>
  )
}
