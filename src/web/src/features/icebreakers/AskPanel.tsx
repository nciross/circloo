import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Lightbulb, X } from 'lucide-react'
import { ApiError } from '../../api/client'
import { useAllowance, useAsk, useKeep, type AskResult, type Spark } from '../../api/sparks'
import { useDeckStore } from '../../stores/deck'
import { useUiStore } from '../../stores/ui'
import { Button } from '../../components/Button'
import { RiddleAnswer } from './RitualCard'

const THEME_MAX = 60

/** Fresh cards on request: Microsoft Foundry in prod, a free seed remix in dev. Every card is labelled and kept or dismissed. */
export function AskPanel() {
  const { t, i18n } = useTranslation()
  const locale = useUiStore((s) => s.locale)
  const pin = useDeckStore((s) => s.pin)
  const allowance = useAllowance()
  const ask = useAsk()
  const keep = useKeep()
  const [theme, setTheme] = useState('')
  const [result, setResult] = useState<AskResult | null>(null)
  const [kept, setKept] = useState<number[]>([])
  const [dismissed, setDismissed] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [themeInvalid, setThemeInvalid] = useState(false)
  const [askedLang, setAskedLang] = useState(locale)
  const errorId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const themeRef = useRef<HTMLInputElement>(null)

  const remaining = result?.remainingToday ?? allowance.data?.remainingToday

  const runAsk = async (themeText: string) => {
    if (remaining === 0 || ask.isPending) return
    setError(null)
    setThemeInvalid(false)
    try {
      setAskedLang(locale)
      // Read the filters at call time: an Ask circloo plan may have just changed them.
      const f = useDeckStore.getState()
      const r = await ask.mutateAsync({ lang: locale, audience: f.audience, tone: f.tone, kind: f.kind, kidsSafe: f.kidsSafe, theme: themeText.trim() || undefined })
      setResult(r)
      setKept([])
      setDismissed([])
    } catch (err) {
      if (err instanceof ApiError && err.type === 'unsafe-theme') {
        setError(t('ice.ask.errors.unsafe'))
        setThemeInvalid(true)
      } else if (err instanceof ApiError && err.status === 429) {
        const raw = err.resetsAt ?? allowance.data?.resetsAt
        const at = raw ? new Date(raw) : null
        setError(at && at.getTime() > Date.now()
          ? t('ice.ask.errors.limited', { time: at.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) })
          : t('ice.ask.errors.limitedNoTime'))
      } else if (err instanceof ApiError && err.status === 409) setError(t('ice.ask.errors.inFlight'))
      else setError(t('ice.ask.errors.unavailable'))
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void runAsk(theme)
  }

  // A checked Ask circloo plan can request fresh cards about a theme: fill it in and ask, once.
  const pendingAsk = useDeckStore((s) => s.pendingAsk)
  useEffect(() => {
    if (pendingAsk === null || allowance.isPending) return
    useDeckStore.getState().requestAsk(null)
    setTheme(pendingAsk)
    void runAsk(pendingAsk)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk, allowance.isPending])

  const keepOne = async (index: number) => {
    if (!result) return
    try {
      const spark: Spark = await keep.mutateAsync({ keepToken: result.keepToken, index })
      setKept((k) => [...k, index])
      pin(spark)
    } catch {
      setError(t('ice.ask.errors.expired'))
    }
  }

  const visible = result?.items.filter((i) => !dismissed.includes(i.index)) ?? []

  // Dismissing removes the focused card: focus moves to the next card's first action, or back to the theme field.
  const dismiss = (index: number) => {
    const at = visible.findIndex((i) => i.index === index)
    setDismissed((d) => [...d, index])
    requestAnimationFrame(() => {
      const actions = listRef.current?.querySelectorAll<HTMLButtonElement>('.fresh-card__keep')
      ;(actions?.[Math.min(at, (actions?.length ?? 1) - 1)] ?? themeRef.current)?.focus()
    })
  }

  return (
    <section className="panel ask-panel" aria-labelledby="ask-title">
      <div className="panel__head">
        <h2 id="ask-title" className="panel__title">{t('ice.ask.title')}</h2>
        <span className="lozenge lozenge--ai">{t('ice.ask.aiLabel')}</span>
      </div>
      <p className="ask-panel__lead">{t('ice.ask.lead')}</p>
      <form onSubmit={submit} className="ask-panel__form" noValidate>
        <label className="ask-panel__field">
          <span>{t('ice.ask.themeLabel')}</span>
          <input
            ref={themeRef}
            value={theme}
            maxLength={THEME_MAX}
            onChange={(e) => setTheme(e.target.value)}
            placeholder={t('ice.ask.themePlaceholder')}
            aria-invalid={themeInvalid || undefined}
            aria-describedby={themeInvalid ? errorId : undefined}
            autoComplete="off"
          />
        </label>
        <div className="ask-panel__row">
          <Button type="submit" variant="ai" icon={<Lightbulb size={16} strokeWidth={2.25} />} busy={ask.isPending} aria-disabled={remaining === 0 || undefined}>
            {ask.isPending ? t('ice.ask.asking') : t('ice.ask.ask')}
          </Button>
          {remaining !== undefined ? <span className="ask-panel__allowance">{t('ice.ask.remaining', { count: remaining })}</span> : null}
        </div>
      </form>
      {error ? <p id={errorId} className="field__error" role="alert">{error}</p> : null}
      <p className="visually-hidden" aria-live="polite">{result ? t('ice.ask.freshCount', { count: result.items.length }) : ''}</p>
      {visible.length > 0 ? (
        <ul ref={listRef} className="fresh-list" aria-label={t('ice.ask.results')}>
          {visible.map((item) => {
            const isKept = kept.includes(item.index)
            return (
              <li key={item.index} className={`fresh-card${isKept ? ' is-kept' : ''}`} lang={askedLang}>
                <span className="lozenge lozenge--ai">{t('ice.ask.aiLabel')}</span>
                <p dir="auto">{item.text}</p>
                {item.answer ? <RiddleAnswer answer={item.answer} lang={askedLang} /> : null}
                <div className="fresh-card__actions">
                  <button type="button" className="mini-btn mini-btn--keep fresh-card__keep" aria-disabled={isKept || undefined} onClick={() => { if (!isKept) void keepOne(item.index) }}>
                    <Check size={16} strokeWidth={3} aria-hidden="true" /> {isKept ? t('ice.ask.kept') : t('ice.ask.keep')}
                  </button>
                  {!isKept ? (
                    <button
                      type="button"
                      className="mini-btn"
                      aria-label={t('ice.ask.dismiss')}
                      onClick={() => dismiss(item.index)}
                    >
                      <X size={16} strokeWidth={3} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
