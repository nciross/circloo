import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Plus, Shuffle, StepForward, Timer, X } from 'lucide-react'
import { NAME_MAX, TIMER_CHOICES, useMeetingStore, type TimerChoice } from '../../stores/meeting'
import { MagnetButton } from '../../components/Magnet'
import { ChoiceMagnets } from '../../components/ChoiceMagnets'

/** The chrome magnetic strip: everyone in the room as a name magnet; whoever's turn it is pops off the line. */
export function RitualLine({ onNextCard }: { onNextCard: () => void }) {
  const { t } = useTranslation()
  const { names, order, turn, phase, timer, turnStartedAt, addName, removeName, setTimer, start, next, reshuffle, reset } = useMeetingStore()
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  const current = phase === 'round' ? order[turn] : undefined

  // Kitchen timer per person, derived from when the turn started (no state reset needed).
  useEffect(() => {
    if (phase !== 'round' || timer === 0) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [phase, timer])
  const left = Math.max(0, timer - Math.floor((Math.max(now, turnStartedAt) - turnStartedAt) / 1000))

  const goNext = () => {
    next()
    onNextCard()
  }

  // Keyboard ritual for the person running the meeting: Space = next, S = shuffle (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select, button, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey)) return
      if (e.key === ' ' && useMeetingStore.getState().phase === 'round') {
        e.preventDefault()
        useMeetingStore.getState().next()
        onNextCard()
      } else if (e.key.toLowerCase() === 's' && useMeetingStore.getState().names.length >= 2) {
        useMeetingStore.getState().reshuffle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNextCard])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (addName(draft)) setDraft('')
    inputRef.current?.focus()
  }

  const shown = phase === 'gathering' ? names : order

  return (
    <section className="ritual-line" aria-labelledby="line-title">
      <div className="ritual-line__head">
        <h2 id="line-title" className="ritual-line__title">{t('ice.line.title')}</h2>
        <ChoiceMagnets<`${TimerChoice}`>
          label={t('ice.line.timer')}
          tone="ink"
          value={`${timer}`}
          onChange={(v) => setTimer(Number(v) as TimerChoice)}
          choices={TIMER_CHOICES.map((c) => ({ value: `${c}` as `${TimerChoice}`, label: c === 0 ? t('ice.line.timerOff') : t('ice.line.seconds', { count: c }), icon: c === 0 ? undefined : <Timer size={14} /> }))}
        />
      </div>

      <div className="ritual-line__strip">
        <ol className="name-magnets" aria-label={t('ice.line.title')}>
          {shown.map((name, i) => {
            const isNow = phase === 'round' && i === turn
            const isDone = phase === 'done' || (phase === 'round' && i < turn)
            return (
              <li key={name} className={`name-magnet${isNow ? ' is-now' : ''}${isDone ? ' is-done' : ''}`} aria-current={isNow ? 'step' : undefined}>
                <bdi>{name}</bdi>
                <button type="button" className="name-magnet__remove" aria-label={t('ice.line.remove', { name })} onClick={() => removeName(name)}>
                  <X size={14} strokeWidth={3} aria-hidden="true" />
                </button>
              </li>
            )
          })}
          <li className="name-magnet name-magnet--add">
            <form onSubmit={submit}>
              <label className="visually-hidden" htmlFor="add-name">{t('ice.line.addLabel')}</label>
              <input
                id="add-name"
                ref={inputRef}
                value={draft}
                maxLength={NAME_MAX}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('ice.line.addPlaceholder')}
                autoComplete="off"
              />
              <button type="submit" className="name-magnet__add" aria-label={t('ice.line.add')}>
                <Plus size={16} strokeWidth={3} aria-hidden="true" />
              </button>
            </form>
          </li>
        </ol>
      </div>

      <div className="ritual-line__controls" aria-live="polite">
        {phase === 'gathering' ? (
          names.length < 2 ? (
            <p className="ritual-line__hint">{t('ice.line.empty')}</p>
          ) : (
            <MagnetButton color="tomato" size="lg" onClick={start}>{t('ice.line.start')}</MagnetButton>
          )
        ) : phase === 'round' && current ? (
          <>
            <p className="ritual-line__turn">
              <Trans i18nKey="ice.line.turnOf" values={{ name: current }} components={{ name: <bdi className="ritual-line__who" /> }} />
            </p>
            {timer > 0 ? (
              <span className={`kitchen-timer${left === 0 ? ' is-ringing' : ''}`} role="timer" aria-label={t('ice.line.timer')}>
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              </span>
            ) : null}
            <MagnetButton color="tomato" size="lg" icon={<StepForward className="flip-rtl" size={20} strokeWidth={2.5} />} onClick={goNext}>
              {t('ice.line.next')}
            </MagnetButton>
            <MagnetButton color="paper" icon={<Shuffle size={18} strokeWidth={2.5} />} onClick={reshuffle}>
              {t('ice.line.shuffle')}
            </MagnetButton>
          </>
        ) : (
          <>
            <p className="ritual-line__turn">{t('ice.line.done')}</p>
            <MagnetButton color="tomato" size="lg" onClick={() => { reset(); start(); onNextCard() }}>{t('ice.line.again')}</MagnetButton>
          </>
        )}
        <p className="ritual-line__keys">{t('ice.line.keys')}</p>
      </div>
    </section>
  )
}
