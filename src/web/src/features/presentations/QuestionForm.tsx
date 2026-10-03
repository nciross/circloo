import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, ListChecks, Plus, Vote, X } from 'lucide-react'
import { ApiError } from '../../api/client'
import {
  MAX_OPTIONS, MIN_OPTIONS, OPTION_IDS, OPTION_MAX, QUESTION_MAX, timerChoices, withoutOption, type QuestionInput,
} from '../../api/presentations'
import { Button } from '../../components/Button'
import { Segmented } from '../../components/Segmented'

type Errors = Record<string, string>

export function Switch({ on, onChange, busy, children }: { on: boolean; onChange: (v: boolean) => void; busy?: boolean; children: string }) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={on} aria-busy={busy || undefined} onClick={() => onChange(!on)}>
      <span className="switch__track" aria-hidden="true"><span className="switch__knob" /></span>
      {children}
    </button>
  )
}

/** Turns server validation codes into messages per field (contracts/rest.md); an unknown code reads as a generic error. */
function toErrors(err: unknown, t: (k: string) => string, exists: (k: string) => boolean): Errors | null {
  if (!(err instanceof ApiError)) return null
  if (err.status === 409) return { form: t('presentations.errors.stale') }
  if (!err.errors) return null
  return Object.fromEntries(Object.entries(err.errors).map(([field, codes]) => {
    const key = `presentations.q.errors.${codes[0]}`
    return [field, exists(key) ? t(key) : t('common.errorGeneric')]
  }))
}

const blank = (kind: 'poll' | 'quiz'): QuestionInput => ({
  kind,
  question: '',
  options: [{ text: '' }, { text: '' }],
  multipleChoice: false,
  correctOption: kind === 'quiz' ? 'a' : null,
  timerSeconds: kind === 'quiz' ? 20 : null,
  showFirst: true,
  showLive: false,
})

/** Fields that have their own place on the form; other errors (`too-many-questions`, `stale`…) show above the actions. */
const onForm = (field: string) => ['question', 'options', 'correctOption', 'timerSeconds'].includes(field) || field.startsWith('options[')

/**
 * The poll/quiz form (spec 006 US2). A poll has 2–6 options, single or multiple choice, and may show results live;
 * a quiz has one correct option (a radio, marked by icon and label, never colour alone) and a 10–60 s timer. Both can
 * turn the "who answered first" spotlight off. Focus always lands somewhere useful: on the new answer, on the answer
 * that took a removed one's place, or on the first field to fix after a refused save.
 */
export function QuestionForm({ initial, kind, onSave, onCancel, onDirtyChange, saving, autoFocus }: {
  initial?: QuestionInput
  kind?: 'poll' | 'quiz'
  onSave: (q: QuestionInput) => Promise<unknown>
  onCancel?: () => void
  onDirtyChange?: (dirty: boolean) => void
  saving: boolean
  autoFocus?: boolean
}) {
  const { t, i18n } = useTranslation()
  const [start] = useState<QuestionInput>(() => initial ?? blank(kind ?? 'poll'))
  const [q, setQ] = useState<QuestionInput>(start)
  const [saved, setSaved] = useState(start)
  // Stable row keys, so removing a middle answer never moves typing or focus to another row.
  const nextKey = useRef(start.options.length)
  const [keys, setKeys] = useState(() => start.options.map((_, i) => i))
  const [errors, setErrors] = useState<Errors>({})
  const [failed, setFailed] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const focusOption = useRef<number | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const question = useRef<HTMLTextAreaElement>(null)
  const base = useId()
  const isQuiz = q.kind === 'quiz'
  const dirty = JSON.stringify(q) !== JSON.stringify(saved)

  useEffect(() => {
    if (autoFocus) question.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (focusOption.current === null) return
    form.current?.querySelectorAll<HTMLInputElement>('.qform__option .input')[focusOption.current]?.focus()
    focusOption.current = null
  }, [keys])

  useEffect(() => {
    // After a refused save, focus the first field to fix (or the message that says what went wrong).
    if (Object.keys(errors).length === 0) return
    const target = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.current?.querySelector<HTMLElement>('.qform__form-error')
    target?.focus()
  }, [errors])

  const set = (patch: Partial<QuestionInput>) => {
    setSavedNote(false)
    setQ((prev) => ({ ...prev, ...patch }))
  }
  const setOption = (i: number, text: string) => set({ options: q.options.map((o, k) => (k === i ? { text } : o)) })
  const addOption = () => {
    focusOption.current = q.options.length
    set({ options: [...q.options, { text: '' }] })
    setKeys((k) => [...k, nextKey.current++])
  }
  const removeOption = (i: number) => {
    focusOption.current = Math.min(i, q.options.length - 2)
    setSavedNote(false)
    setQ((prev) => withoutOption(prev, i))
    setKeys((k) => k.filter((_, n) => n !== i))
  }
  const switchKind = (k: 'poll' | 'quiz') =>
    set({ kind: k, correctOption: k === 'quiz' ? (q.correctOption ?? 'a') : null, timerSeconds: k === 'quiz' ? (q.timerSeconds ?? 20) : null, multipleChoice: k === 'quiz' ? false : q.multipleChoice, showLive: k === 'quiz' ? false : q.showLive })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setFailed(false)
    const clean = { ...q, question: q.question.trim(), options: q.options.map((o) => ({ text: o.text.trim() })) }
    try {
      await onSave(clean)
      setSaved(q)
      setSavedNote(true)
    } catch (err) {
      const fieldErrors = toErrors(err, t, (k) => i18n.exists(k))
      if (fieldErrors) setErrors(fieldErrors)
      else setFailed(true)
    }
  }

  const err = (field: string) => errors[field]
  const errId = (field: string) => `${base}-${field.replace(/\W/g, '')}-err`
  const describedBy = (...fields: string[]) => fields.filter(err).map(errId).join(' ') || undefined
  const fieldError = (field: string) => (err(field) ? <p id={errId(field)} className="field__error" role="alert">{err(field)}</p> : null)
  const formErrors = Object.entries(errors).filter(([field]) => !onForm(field)).map(([, message]) => message)
  const optionsInvalid = !!(err('options') || err('correctOption'))

  return (
    <form ref={form} className="qform" onSubmit={submit} noValidate>
      <Segmented<'poll' | 'quiz'>
        label={t('presentations.q.kind')}
        value={q.kind}
        onChange={switchKind}
        choices={[
          { value: 'poll', label: t('presentations.q.poll'), icon: <Vote size={14} aria-hidden="true" /> },
          { value: 'quiz', label: t('presentations.q.quiz'), icon: <ListChecks size={14} aria-hidden="true" /> },
        ]}
      />

      <div className="field">
        <label className="field__label" htmlFor={`${base}-q`}>{t('presentations.q.question')}</label>
        <textarea ref={question} id={`${base}-q`} className="input qform__question" dir="auto" rows={2} maxLength={QUESTION_MAX} value={q.question}
          onChange={(e) => set({ question: e.target.value })} aria-invalid={err('question') ? true : undefined} aria-describedby={describedBy('question')} />
        {fieldError('question')}
      </div>

      <fieldset className={['qform__options', optionsInvalid ? 'is-invalid' : ''].filter(Boolean).join(' ')} aria-describedby={describedBy('options', 'correctOption')}>
        <legend className="field__label">{isQuiz ? t('presentations.q.optionsQuiz') : t('presentations.q.options')}</legend>
        <ol className="qform__list">
          {q.options.map((o, i) => {
            const id = OPTION_IDS[i]
            const correct = isQuiz && q.correctOption === id
            return (
              <li key={keys[i]} className={['qform__option', correct ? 'is-correct' : ''].filter(Boolean).join(' ')}>
                {isQuiz ? (
                  <label className="qform__correct">
                    <input type="radio" className="visually-hidden" name={`${base}-correct`} checked={correct} onChange={() => set({ correctOption: id })} />
                    {correct ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                    <span className="visually-hidden">{t('presentations.q.markCorrect', { n: i + 1 })}</span>
                  </label>
                ) : (
                  <span className="qform__letter" aria-hidden="true">{i + 1}</span>
                )}
                <label className="visually-hidden" htmlFor={`${base}-o${keys[i]}`}>{t('presentations.q.option', { n: i + 1 })}</label>
                <input id={`${base}-o${keys[i]}`} className="input" dir="auto" maxLength={OPTION_MAX} value={o.text} onChange={(e) => setOption(i, e.target.value)}
                  aria-invalid={err(`options[${i}]`) ? true : undefined} aria-describedby={describedBy(`options[${i}]`)} />
                {correct ? <span className="lozenge lozenge--success qform__badge">{t('presentations.q.correct')}</span> : null}
                {q.options.length > MIN_OPTIONS ? (
                  <button type="button" className="qform__remove" onClick={() => removeOption(i)} aria-label={t('presentations.q.removeOption', { n: i + 1 })}>
                    <X size={16} aria-hidden="true" />
                  </button>
                ) : null}
                {fieldError(`options[${i}]`)}
              </li>
            )
          })}
        </ol>
        {q.options.length < MAX_OPTIONS ? (
          <Button size="sm" variant="subtle" icon={<Plus size={14} />} onClick={addOption}>{t('presentations.q.addOption')}</Button>
        ) : null}
        {fieldError('options')}
        {fieldError('correctOption')}
      </fieldset>

      <div className="qform__settings">
        {isQuiz ? (
          <div className="field qform__timer">
            <label className="field__label" htmlFor={`${base}-t`}>{t('presentations.q.timer')}</label>
            <select id={`${base}-t`} className="input" value={q.timerSeconds ?? 20} onChange={(e) => set({ timerSeconds: Number(e.target.value) })}
              aria-invalid={err('timerSeconds') ? true : undefined} aria-describedby={describedBy('timerSeconds')}>
              {timerChoices(q.timerSeconds).map((s) => <option key={s} value={s}>{t('presentations.q.seconds', { count: s })}</option>)}
            </select>
            {fieldError('timerSeconds')}
          </div>
        ) : (
          <>
            <Switch on={!!q.multipleChoice} onChange={(v) => set({ multipleChoice: v })}>{t('presentations.q.multiple')}</Switch>
            <Switch on={!!q.showLive} onChange={(v) => set({ showLive: v })}>{t('presentations.q.showLive')}</Switch>
          </>
        )}
        <Switch on={q.showFirst ?? true} onChange={(v) => set({ showFirst: v })}>{t('presentations.q.showFirst')}</Switch>
      </div>

      {formErrors.map((message) => <p key={message} className="field__error qform__form-error" role="alert" tabIndex={-1}>{message}</p>)}
      {failed ? <p className="field__error qform__form-error" role="alert" tabIndex={-1}>{t('common.errorGeneric')}</p> : null}
      <div className="qform__actions">
        <p className="qform__saved" role="status">{savedNote && !dirty && initial ? t('presentations.q.saved') : ''}</p>
        {onCancel ? <Button variant="subtle" onClick={onCancel}>{t('common.cancel')}</Button> : null}
        <Button type="submit" busy={saving}>{t('presentations.q.save')}</Button>
      </div>
    </form>
  )
}
