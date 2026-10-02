import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Plus, Shuffle, StepForward, Timer, X } from 'lucide-react'
import { NAME_MAX, TIMER_CHOICES, useMeetingStore, type AddResult, type TimerChoice } from '../../stores/meeting'
import { Button } from '../../components/Button'
import { Segmented } from '../../components/Segmented'

const TYPING = 'input, textarea, select, [contenteditable]'
const TIMES_UP_GRACE_MS = 2500

/** The line: everyone in the room as a swimmer chip; whoever's turn it is dives off the block. */
export function RitualLine({ onNextCard }: { onNextCard: () => void }) {
  const { t } = useTranslation()
  const { names, order, turn, phase, timer, turnStartedAt, addName, removeName, setTimer, start, next, reshuffle, reset } = useMeetingStore()
  const [draft, setDraft] = useState('')
  const [addError, setAddError] = useState<Exclude<AddResult, 'added'> | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const sectionRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const mounted = useRef(false)

  const current = phase === 'round' ? order[turn] : undefined

  // Turn timer per person, derived from when the turn started (no state reset needed).
  useEffect(() => {
    if (phase !== 'round' || timer === 0) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [phase, timer])
  const left = Math.max(0, timer - Math.floor((Math.max(now, turnStartedAt) - turnStartedAt) / 1000))
  const timesUp = phase === 'round' && timer > 0 && left === 0

  // When a phase swaps the controls, focus moves to the control that replaced the one in use (WCAG 2.4.3),
  // never on first render, and only if focus was inside the ritual line or already lost.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const active = document.activeElement
    if (active === document.body || sectionRef.current?.contains(active)) {
      if (!active?.matches(TYPING)) primaryRef.current?.focus()
    }
  }, [phase])

  const goNext = () => {
    next()
    onNextCard()
  }

  // Spec 3.2: when the turn timer runs out, "time's up" shows and is announced, then the next person goes.
  useEffect(() => {
    if (!timesUp) return
    const startedAt = turnStartedAt
    const id = window.setTimeout(() => {
      if (useMeetingStore.getState().turnStartedAt !== startedAt) return
      useMeetingStore.getState().next()
      onNextCard()
    }, TIMES_UP_GRACE_MS)
    return () => window.clearTimeout(id)
  }, [timesUp, turnStartedAt, onNextCard])

  // Shortcuts work only while focus is inside the ritual line (WCAG 2.1.4), never while typing.
  // e.code keeps S working on Arabic and other non-Latin layouts; held keys do not race through people.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || target.matches(TYPING)) return
    if (e.code === 'Space' && phase === 'round' && !target.matches('button')) {
      e.preventDefault()
      goNext()
    } else if (e.code === 'KeyS' && phase === 'round') {
      e.preventDefault()
      reshuffle()
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const result = addName(draft)
    if (result === 'added') {
      setDraft('')
      setAddError(null)
    } else setAddError(result)
    inputRef.current?.focus()
  }

  const remove = (name: string, index: number) => {
    removeName(name)
    // Focus the next name's remove button, or the add field once the list is empty.
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('.swimmer__remove')
      const target = buttons?.[Math.min(index, (buttons?.length ?? 1) - 1)]
      ;(target ?? inputRef.current)?.focus()
    })
  }

  const shown = phase === 'gathering' ? names : order

  return (
    <section ref={sectionRef} className="panel line" aria-labelledby="line-title" onKeyDown={onKeyDown} data-perch="line">
      <div className="panel__head">
        <h2 id="line-title" className="panel__title">{t('ice.line.title')}</h2>
        <Segmented<`${TimerChoice}`>
          className="seg--timer"
          label={t('ice.line.timer')}
          value={`${timer}`}
          onChange={(v) => setTimer(Number(v) as TimerChoice)}
          choices={TIMER_CHOICES.map((c) => ({ value: `${c}` as `${TimerChoice}`, label: c === 0 ? t('ice.line.timerOff') : t('ice.line.seconds', { count: c }), icon: c === 0 ? undefined : <Timer size={14} /> }))}
        />
      </div>

      <div className="line__strip">
        <ol ref={listRef} className="swimmers" aria-labelledby="line-title">
          {shown.map((name, i) => {
            const isNow = phase === 'round' && i === turn
            const isDone = phase === 'done' || (phase === 'round' && i < turn)
            return (
              <li key={name} className={`swimmer${isNow ? ' is-now' : ''}${isDone ? ' is-done' : ''}`} aria-current={isNow ? 'step' : undefined}>
                <bdi>{name}</bdi>
                {isDone ? <span className="visually-hidden">{t('ice.line.hadTurn')}</span> : null}
                <button type="button" className="swimmer__remove" aria-label={t('ice.line.remove', { name })} onClick={() => remove(name, i)}>
                  <X size={14} strokeWidth={3} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ol>
        <form className="swimmer swimmer--add" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="add-name">{t('ice.line.addLabel')}</label>
          <input
            id="add-name"
            ref={inputRef}
            value={draft}
            maxLength={NAME_MAX}
            onChange={(e) => {
              setDraft(e.target.value)
              setAddError(null)
            }}
            placeholder={t('ice.line.addPlaceholder')}
            autoComplete="off"
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? 'add-name-error' : undefined}
          />
          <button type="submit" className="swimmer__add" aria-label={t('ice.line.add')}>
            <Plus size={16} strokeWidth={3} aria-hidden="true" />
          </button>
        </form>
      </div>
      {addError ? <p id="add-name-error" className="field__error" role="alert">{t(`ice.line.addErrors.${addError}`)}</p> : null}

      <p className="visually-hidden" aria-live="polite">
        {current ? (timesUp ? t('ice.line.timesUp', { name: current }) : t('ice.line.turnOfPlain', { name: current })) : phase === 'done' ? t('ice.line.done') : ''}
      </p>

      <div className="line__controls">
        {phase === 'gathering' ? (
          names.length < 2 ? (
            <p className="line__hint">{t('ice.line.empty')}</p>
          ) : (
            <Button ref={primaryRef} variant="primary" size="lg" onClick={() => { start(); onNextCard() }}>{t('ice.line.start')}</Button>
          )
        ) : phase === 'round' && current ? (
          <>
            <p className="line__turn" aria-hidden="true">
              <Trans i18nKey="ice.line.turnOf" values={{ name: current }} components={{ name: <bdi className="line__who" /> }} />
            </p>
            {timer > 0 ? (
              <span className={`turn-timer${timesUp ? ' is-ringing' : ''}`} role="timer" aria-label={t('ice.line.timer')}>
                {timesUp ? t('ice.line.timesUpShort') : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
              </span>
            ) : null}
            <Button ref={primaryRef} variant="primary" size="lg" icon={<StepForward className="flip-rtl" size={18} strokeWidth={2.25} />} onClick={goNext}>
              {t('ice.line.next')}
            </Button>
            <Button variant="default" icon={<Shuffle size={16} strokeWidth={2.25} />} onClick={reshuffle}>
              {t('ice.line.shuffle')}
            </Button>
          </>
        ) : (
          <>
            <p className="line__turn" aria-hidden="true">{t('ice.line.done')}</p>
            <Button ref={primaryRef} variant="primary" size="lg" onClick={() => { reset(); start(); onNextCard() }}>{t('ice.line.again')}</Button>
          </>
        )}
      </div>
      {phase === 'round' ? (
        <p className="line__keys">
          <Trans i18nKey="ice.line.keysHint" components={{ k: <kbd dir="ltr" /> }} />
        </p>
      ) : null}
    </section>
  )
}
