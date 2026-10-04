import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, EyeOff, Info, ListChecks, Loader2, StickyNote, Trash2, Vote, X } from 'lucide-react'
import { ApiError } from '../../api/client'
import {
  errorKey, fromSlide, usePresentation, useAddQuestion, useDeleteSlide, useMoveSlide, useSetHidden, useUpdatePresentation, useUpdateQuestion,
  type PresentationDetail, type SlideView,
} from '../../api/presentations'
import { QuestionForm, Switch } from './QuestionForm'
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

/** A refused edit: "changed meanwhile" for a version conflict, otherwise the generic message. */
const editErrorKey = (err: unknown) => (err instanceof ApiError && err.status === 409 ? 'presentations.errors.stale' : 'common.errorGeneric')

/** Presentation-wide: whether quizzes can end with a podium (FR-606). Shown once there is a quiz; flips at once. */
function PodiumSetting({ deck }: { deck: PresentationDetail }) {
  const { t } = useTranslation()
  const update = useUpdatePresentation(deck.id)
  const on = update.isPending ? (update.variables?.showPodium ?? deck.showPodium) : deck.showPodium
  return (
    <>
      <Switch on={on} busy={update.isPending} onChange={(v) => update.mutate({ showPodium: v })}>{t('presentations.showPodium')}</Switch>
      {update.isError ? <p className="field__error" role="alert">{t(editErrorKey(update.error))}</p> : null}
    </>
  )
}

/** Presentation-wide: answers open as soon as a question is shown (#170). Shown once there is a question; flips at once. */
function AutoOpenSetting({ deck }: { deck: PresentationDetail }) {
  const { t } = useTranslation()
  const update = useUpdatePresentation(deck.id)
  const on = update.isPending ? (update.variables?.autoOpen ?? deck.autoOpen) : deck.autoOpen
  return (
    <>
      <Switch on={on} busy={update.isPending} onChange={(v) => update.mutate({ autoOpen: v })}>{t('presentations.autoOpen')}</Switch>
      <p className="field__help">{t(on ? 'presentations.autoOpenOn' : 'presentations.autoOpenOff')}</p>
      {update.isError ? <p className="field__error" role="alert">{t(editErrorKey(update.error))}</p> : null}
    </>
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

interface EditorActions {
  /** Runs `action` now, or after the author confirms dropping unsaved question changes. */
  guard: (action: () => void) => void
  onDirtyChange: (dirty: boolean) => void
  /** A question was added: select it, put focus on it in the strip and say where it went. */
  onCreated: (slideId: string, kind: 'poll' | 'quiz', number: number) => void
  announce: (message: string) => void
}

/** "Earlier / later": up and down beside the vertical strip; inline start and end when the strip runs across (phones, RTL-aware). */
const MoveIcon = ({ later }: { later: boolean }) => (
  <>
    {later ? <ArrowDown size={14} className="move-icon move-icon--block" /> : <ArrowUp size={14} className="move-icon move-icon--block" />}
    {later ? <ArrowRight size={14} className="move-icon move-icon--inline" /> : <ArrowLeft size={14} className="move-icon move-icon--inline" />}
  </>
)

function Preview({ deck, slide, number, actions }: { deck: PresentationDetail; slide: SlideView; number: number; actions: EditorActions }) {
  const { t } = useTranslation()
  const setHidden = useSetHidden(deck.id)
  const remove = useDeleteSlide(deck.id)
  const add = useAddQuestion(deck.id)
  const update = useUpdateQuestion(deck.id)
  const move = useMoveSlide(deck.id)
  const [confirming, setConfirming] = useState(false)
  const [adding, setAdding] = useState<'poll' | 'quiz' | null>(null)
  const returnFocus = useRef<'poll' | 'quiz' | null>(null)
  const addPoll = useRef<HTMLButtonElement>(null)
  const addQuiz = useRef<HTMLButtonElement>(null)
  const count = deck.slides.length
  const failure = [setHidden, remove, move].find((m) => m.isError)?.error
  const label = t('presentations.slideLabel', { number, state: '' }).trim()
  const kindLabel = t(slide.kind === 'quiz' ? 'presentations.q.quiz' : 'presentations.q.poll')

  useEffect(() => {
    // Back from the new-question form: focus returns to the button that opened it.
    if (adding || !returnFocus.current) return
    ;(returnFocus.current === 'quiz' ? addQuiz : addPoll).current?.focus()
    returnFocus.current = null
  }, [adding])

  const create = async (q: Parameters<typeof add.mutateAsync>[0]) => {
    const before = new Set(deck.slides.map((s) => s.id))
    const detail = await add.mutateAsync({ ...q, afterSlideId: slide.id })
    const index = detail.slides.findIndex((s) => !before.has(s.id))
    const created = detail.slides[index]
    actions.onDirtyChange(false)
    if (created) actions.onCreated(created.id, q.kind, index + 1)
  }

  const cancel = () => {
    returnFocus.current = adding
    actions.onDirtyChange(false)
    setAdding(null)
  }

  const step = (delta: number) => {
    if (move.isPending || number + delta < 1 || number + delta > count) return
    move.mutate({ slideId: slide.id, delta }, {
      onSuccess: (detail) => actions.announce(t('presentations.movedTo', { number: detail.slides.findIndex((s) => s.id === slide.id) + 1, count })),
    })
  }

  if (adding) {
    const heading = t(adding === 'quiz' ? 'presentations.q.newQuiz' : 'presentations.q.newPoll')
    return (
      <section className="slide-preview" aria-label={heading}>
        <h2 className="slide-preview__heading">{heading}</h2>
        <QuestionForm kind={adding} autoFocus saving={add.isPending} onSave={create} onCancel={cancel} onDirtyChange={actions.onDirtyChange} />
      </section>
    )
  }

  return (
    <section className="slide-preview" aria-label={label}>
      {slide.kind === 'deck' ? (
        <div className="slide-preview__frame">
          {slide.image ? <img src={slide.image} alt={label} width={1920} height={1080} /> : null}
        </div>
      ) : (
        <>
          <h2 className="slide-preview__heading">{t('presentations.q.editHeading', { kind: kindLabel, number })}</h2>
          <QuestionForm initial={fromSlide(slide)} saving={update.isPending} onDirtyChange={actions.onDirtyChange}
            onSave={(question) => update.mutateAsync({ slideId: slide.id, question })} />
        </>
      )}
      <div className="slide-preview__bar">
        {/* aria-disabled, not disabled: at the first or last place the button keeps keyboard focus. */}
        <Button size="sm" variant="subtle" className="slide-preview__up" icon={<MoveIcon later={false} />} aria-label={t('presentations.moveUp')}
          aria-disabled={number <= 1 || undefined} busy={move.isPending} onClick={() => step(-1)} />
        <Button size="sm" variant="subtle" className="slide-preview__down" icon={<MoveIcon later />} aria-label={t('presentations.moveDown')}
          aria-disabled={number >= count || undefined} busy={move.isPending} onClick={() => step(1)} />
        {slide.kind === 'deck' ? (
          <Button size="sm" variant="default" className="slide-preview__hide" icon={slide.hidden ? <Eye size={14} /> : <EyeOff size={14} />} busy={setHidden.isPending}
            onClick={() => setHidden.mutate({ slideId: slide.id, hidden: !slide.hidden })}>
            {slide.hidden ? t('presentations.show') : t('presentations.hide')}
          </Button>
        ) : null}
        <span className="slide-preview__add">
          <Button ref={addPoll} size="sm" variant="default" className="slide-preview__poll" icon={<Vote size={14} />}
            onClick={() => actions.guard(() => setAdding('poll'))}>{t('presentations.q.addPoll')}</Button>
          <Button ref={addQuiz} size="sm" variant="default" className="slide-preview__quiz" icon={<ListChecks size={14} />}
            onClick={() => actions.guard(() => setAdding('quiz'))}>{t('presentations.q.addQuiz')}</Button>
        </span>
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
      {failure ? <p className="field__error" role="alert">{t(editErrorKey(failure))}</p> : null}
      {slide.kind === 'deck' ? (
        <div className="slide-notes">
          <h2 className="slide-notes__title"><StickyNote size={14} aria-hidden="true" /> {t('presentations.notes')}</h2>
          {slide.notes ? <p className="slide-notes__text" dir="auto">{slide.notes}</p> : <p className="field__help">{t('presentations.noNotes')}</p>}
        </div>
      ) : null}
    </section>
  )
}

/** Asks before unsaved question changes are dropped by selecting another slide or adding a question. */
function UnsavedPrompt({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const { t } = useTranslation()
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => keep.current?.focus(), [])
  return (
    <div className="deck-unsaved" role="alert">
      <p>{t('presentations.q.unsaved')}</p>
      <Button ref={keep} size="sm" variant="default" onClick={onKeep}>{t('presentations.q.keepEditing')}</Button>
      <Button size="sm" variant="subtle" onClick={onDiscard}>{t('presentations.q.discard')}</Button>
    </div>
  )
}

/** One presentation: its slides in order with notes, poll and quiz questions anywhere, reorder by drag or keyboard (spec 006 US1–US2). */
export default function Editor() {
  const { t } = useTranslation()
  useDocumentTitle('presentations.title')
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const query = usePresentation(id)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [showNote, dismissNote] = useStillNote(id)
  const [announcement, setAnnouncement] = useState('')
  const [pending, setPending] = useState<(() => void) | null>(null)
  const focusSlide = useRef<string | null>(null)
  const dirty = useRef(false)
  const strip = useRef<HTMLOListElement>(null)
  const move = useMoveSlide(id)

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 404) void navigate('/app/presentations', { replace: true })
  }, [query.error, navigate])

  useEffect(() => {
    // A new question takes focus in the strip once it is rendered there.
    if (!focusSlide.current) return
    strip.current?.querySelector<HTMLElement>(`[data-slide="${focusSlide.current}"] .slide-thumb`)?.focus()
    focusSlide.current = null
  }, [selected, query.data])

  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d
  }, [])

  if (query.isPending) return <Loading />
  const deck = query.data
  if (!deck) return <p className="field__error" role="alert">{t('common.errorGeneric')}</p>

  const slides = deck.slides
  const current = slides.find((s) => s.id === selected) ?? slides[0]
  const crumbs = [{ to: '/app', label: t('common.nav.home') }, { to: '/app/presentations', label: t('presentations.title') }]
  const hasQuiz = slides.some((s) => s.kind === 'quiz')
  const hasQuestion = slides.some((s) => s.kind !== 'deck')

  const actions: EditorActions = {
    guard: (action) => (dirty.current ? setPending(() => action) : action()),
    onDirtyChange,
    onCreated: (slideId, kind, number) => {
      focusSlide.current = slideId
      setSelected(slideId)
      setAnnouncement(t(kind === 'quiz' ? 'presentations.q.quizAdded' : 'presentations.q.pollAdded', { number }))
    },
    announce: setAnnouncement,
  }
  const select = (slideId: string) => {
    if (slideId !== current?.id) actions.guard(() => setSelected(slideId))
  }
  const endDrag = () => {
    setDragging(null)
    setDropTarget(null)
  }

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
      {deck.status === 'ready' && hasQuestion ? (
        <div className="deck-settings">
          <AutoOpenSetting deck={deck} />
          {hasQuiz ? <PodiumSetting deck={deck} /> : null}
        </div>
      ) : null}
      {deck.status === 'ready' && showNote ? (
        <div className="deck-note" role="note">
          <Info size={16} aria-hidden="true" />
          <p>{t('presentations.stillNote')}</p>
          <button type="button" className="deck-note__close" aria-label={t('common.close')} onClick={dismissNote}><X size={16} aria-hidden="true" /></button>
        </div>
      ) : null}
      {pending ? (
        <UnsavedPrompt onKeep={() => setPending(null)} onDiscard={() => {
          dirty.current = false
          pending()
          setPending(null)
        }} />
      ) : null}
      {move.isError ? <p className="field__error" role="alert">{t(editErrorKey(move.error))}</p> : null}
      <p className="visually-hidden" role="status">{announcement}</p>

      {deck.status !== 'failed' && current ? (
        <div className="deck-workspace">
          <ol ref={strip} className="slide-strip" aria-label={t('presentations.strip')}>
            {slides.map((s, i) => (
              <li key={s.id} data-slide={s.id} className={dropTarget === s.id && dragging !== s.id ? 'is-drop-target' : undefined}
                draggable
                onDragStart={(e) => {
                  // Firefox only starts a drag that carries data.
                  e.dataTransfer.setData('text/plain', s.id)
                  e.dataTransfer.effectAllowed = 'move'
                  setDragging(s.id)
                }}
                onDragEnd={endDrag}
                onDragOver={(e) => {
                  if (!dragging) return
                  e.preventDefault()
                  setDropTarget(s.id)
                }}
                onDrop={(e) => {
                  if (!dragging) return
                  e.preventDefault()
                  if (dragging !== s.id) move.mutate({ slideId: dragging, to: s.id })
                  endDrag()
                }}>
                <SlideThumb slide={s} number={i + 1} selected={s.id === current.id} onSelect={() => select(s.id)} />
              </li>
            ))}
          </ol>
          <Preview key={current.id} deck={deck} slide={current} number={slides.indexOf(current) + 1} actions={actions} />
        </div>
      ) : null}
    </div>
  )
}
