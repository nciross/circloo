import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Baby, Check, Globe, Home, Languages, Lightbulb, MoonStar, Play, Settings, Shuffle, Sun, Tag, UsersRound, X } from 'lucide-react'
import type { Step } from '../../lib/intent'
import { useStepLabel } from './planning'

const ICONS: Record<Step['type'], typeof Home> = {
  go: ArrowRight,
  audience: UsersRound,
  tone: Tag,
  kind: Tag,
  kidsSafe: Baby,
  deal: Shuffle,
  people: UsersRound,
  start: Play,
  ask: Lightbulb,
  locale: Languages,
  theme: MoonStar,
}

const iconOf = (s: Step) =>
  s.type === 'theme' ? (s.value === 'dark' ? MoonStar : Sun)
    : s.type === 'go' && s.to === 'home' ? Home
      : s.type === 'go' && s.to === 'settings' ? Settings
        : s.type === 'locale' ? Globe
          : ICONS[s.type]

/**
 * A plan Pirikoo proposes from plain words: the person reads it, removes what they don't want, then runs it.
 * Nothing runs before "Run the plan"; removing a step removes exactly that action.
 */
export function PlanCard({ steps, ran, onRun }: { steps: Step[]; ran: boolean; onRun: (kept: Step[]) => void }) {
  const { t } = useTranslation()
  const label = useStepLabel()
  const [removed, setRemoved] = useState<number[]>([])
  const kept = steps.filter((_, i) => !removed.includes(i))
  return (
    <div className="pk-plan">
      <p className="pk-plan__title">{ran ? t('pirikoo.plan.ran') : t('pirikoo.plan.title')}</p>
      <ol className="plan-steps">
        {steps.map((s, i) => {
          if (removed.includes(i)) return null
          const Icon = iconOf(s)
          return (
            <li key={`${s.type}-${i}`} className={`plan-steps__item plan-steps__item--${s.type}`}>
              <span className="plan-steps__icon" aria-hidden="true"><Icon size={16} strokeWidth={2.25} /></span>
              <span className="plan-steps__label" dir="auto">{label(s)}</span>
              {ran ? (
                <Check className="pk-plan__done" size={16} aria-hidden="true" />
              ) : (
                <button type="button" className="icon-btn icon-btn--sm" aria-label={t('pirikoo.plan.remove', { step: label(s) })} onClick={() => setRemoved((r) => [...r, i])}>
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </li>
          )
        })}
      </ol>
      {ran ? null : (
        <button type="button" className="btn btn--ai btn--sm pk-plan__run" aria-disabled={kept.length === 0 || undefined} onClick={() => { if (kept.length) onRun(kept) }}>
          <span className="btn__icon" aria-hidden="true"><Play size={14} strokeWidth={2.5} /></span>
          <span className="btn__label">{t('pirikoo.plan.run')}</span>
        </button>
      )}
    </div>
  )
}
