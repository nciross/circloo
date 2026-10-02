import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ArrowRight, Baby, Globe, Home, Languages, MoonStar, Play, Settings, Shuffle, Sparkles, Sun, Tag, UsersRound, X } from 'lucide-react'
import { plan, type Step } from '../../lib/intent'
import { useDeckStore } from '../../stores/deck'
import { useMeetingStore } from '../../stores/meeting'
import { useUiStore } from '../../stores/ui'
import { useChangeLocale } from '../../app/locale'
import { Button } from '../../components/Button'

const ICONS: Record<Step['type'], typeof Home> = {
  go: ArrowRight,
  audience: UsersRound,
  tone: Tag,
  kind: Tag,
  kidsSafe: Baby,
  deal: Shuffle,
  people: UsersRound,
  start: Play,
  ask: Sparkles,
  locale: Languages,
  theme: MoonStar,
}

function useStepLabel() {
  const { t, i18n } = useTranslation()
  return (s: Step): string => {
    switch (s.type) {
      case 'go': return t(`askbar.steps.${s.to}`)
      case 'audience': return t('askbar.steps.audience', { value: t(`ice.filters.audiences.${s.value}`) })
      case 'tone': return t('askbar.steps.tone', { value: t(`ice.filters.tones.${s.value}`) })
      case 'kind': return t('askbar.steps.kind', { value: t(`ice.filters.kinds.${s.value}`) })
      case 'kidsSafe': return t('askbar.steps.kidsSafe')
      case 'deal': return t('askbar.steps.deal')
      case 'people': return t('askbar.steps.people', { names: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(s.names) })
      case 'start': return t('askbar.steps.start')
      case 'ask': return t('askbar.steps.ask', { theme: s.theme })
      case 'locale': return t('askbar.steps.locale', { value: t(`common.languages.${s.value}`) })
      case 'theme': return t('askbar.steps.theme', { value: t(`settings.themes.${s.value}`) })
    }
  }
}

/** Runs a checked plan, in order: settings first, then where to go, then what to do there. */
function useRunPlan() {
  const navigate = useNavigate()
  const changeLocale = useChangeLocale()
  const setTheme = useUiStore((s) => s.setTheme)
  return (steps: Step[]) => {
    const deck = useDeckStore.getState()
    const meeting = useMeetingStore.getState()
    for (const s of steps) {
      switch (s.type) {
        case 'locale': changeLocale(s.value); break
        case 'theme': setTheme(s.value); break
        case 'go': navigate(s.to === 'home' ? '/app' : `/app/${s.to}`, { viewTransition: true }); break
        case 'audience': deck.setFilter({ audience: s.value }); break
        case 'tone': deck.setFilter({ tone: s.value }); break
        case 'kind': deck.setFilter({ kind: s.value }); break
        case 'kidsSafe': deck.setFilter({ kidsSafe: true }); break
        case 'deal': useDeckStore.getState().shake(); break
        case 'people':
          if (meeting.phase !== 'gathering') meeting.reset()
          for (const n of s.names) useMeetingStore.getState().addName(n)
          break
        case 'start': useMeetingStore.getState().start(); break
        case 'ask': deck.requestAsk(s.theme); break
      }
    }
  }
}

/**
 * Ask circloo (Ctrl/⌘ K): plain words become a plan the person can read, trim and confirm.
 * Nothing runs before "Run the plan"; removing a step removes exactly that action.
 */
export function AskBar({ open, onClose, initial = '', onDone }: { open: boolean; onClose: () => void; initial?: string; onDone: (message: string) => void }) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(initial)
  const [removed, setRemoved] = useState<number[]>([])
  const label = useStepLabel()
  const run = useRunPlan()
  const inputId = useId()
  const planId = useId()

  const steps = useMemo(() => plan(text), [text])
  const kept = steps.filter((_, i) => !removed.includes(i))
  const examples = t('askbar.examples', { returnObjects: true }) as string[]

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      setText(initial)
      setRemoved([])
      d.showModal()
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (!open && d.open) d.close()
  }, [open, initial])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (kept.length === 0) return
    run(kept)
    onClose()
    onDone(t('askbar.done'))
  }

  const removeStep = (i: number) => {
    setRemoved((r) => [...r, i])
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <dialog ref={dialogRef} className="askbar" aria-labelledby={inputId} onClose={onClose} onCancel={onClose}
      onClick={(e) => { if (e.target === dialogRef.current) onClose() }}>
      <form className="askbar__form" onSubmit={submit}>
        <div className="askbar__field">
          <Sparkles className="askbar__spark" size={20} aria-hidden="true" />
          <label htmlFor={inputId} className="visually-hidden">{t('askbar.label')}</label>
          <input
            ref={inputRef}
            id={inputId}
            value={text}
            onChange={(e) => { setText(e.target.value); setRemoved([]) }}
            placeholder={t('askbar.placeholder')}
            autoComplete="off"
            maxLength={160}
            dir="auto"
            aria-describedby={planId}
          />
          <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div id={planId} className="askbar__body" aria-live="polite">
          {text.trim() && kept.length > 0 ? (
            <>
              <h2 className="askbar__title">{t('askbar.planTitle')}</h2>
              <ol className="plan">
                {steps.map((s, i) => {
                  if (removed.includes(i)) return null
                  const Icon = s.type === 'theme' ? (s.value === 'dark' ? MoonStar : Sun) : s.type === 'go' && s.to === 'home' ? Home : s.type === 'go' && s.to === 'settings' ? Settings : s.type === 'locale' ? Globe : ICONS[s.type]
                  return (
                    <li key={`${s.type}-${i}`} className={`plan__step plan__step--${s.type}`}>
                      <span className="plan__icon" aria-hidden="true"><Icon size={16} strokeWidth={2.25} /></span>
                      <span className="plan__label" dir="auto">{label(s)}</span>
                      <button type="button" className="icon-btn icon-btn--sm" aria-label={`${t('ice.ask.dismiss')}: ${label(s)}`} onClick={() => removeStep(i)}>
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ol>
            </>
          ) : (
            <>
              <p className="askbar__hint">{text.trim() ? t('askbar.nothing') : t('askbar.label')}</p>
              <ul className="askbar__examples">
                {examples.map((ex) => (
                  <li key={ex}>
                    <button type="button" className="chip" onClick={() => { setText(ex); setRemoved([]); inputRef.current?.focus() }}>{ex}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="askbar__foot">
          <p className="askbar__keys" aria-hidden="true"><kbd>Esc</kbd> {t('common.close')}</p>
          <Button type="submit" variant="primary" aria-disabled={kept.length === 0 || undefined} icon={<Play size={16} strokeWidth={2.5} />}>
            {t('askbar.run')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
