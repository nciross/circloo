import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { fold, plan, type Step } from '../../lib/intent'
import { useDeckStore } from '../../stores/deck'
import { useMeetingStore } from '../../stores/meeting'
import { useUiStore } from '../../stores/ui'
import { useChangeLocale } from '../../app/locale'

// Interrogative words that open a question, folded (no accents, Arabic alef unified).
const QUESTION_START = new Set([
  'how', 'what', 'why', 'where', 'when', 'who', 'which',
  'comment', 'pourquoi', 'quoi', 'quel', 'quelle', 'quels', 'quelles', 'ou', 'quand', 'qui', 'combien',
  'como', 'que', 'por', 'donde', 'cuando', 'quien', 'cual', 'cuanto',
  'كيف', 'ماذا', 'لماذا', 'متي', 'متى', 'اين', 'هل', 'ما', 'كم',
])

/** A question goes to Pirikoo's answers; an instruction that maps to a plan is planned right here. */
export function isQuestion(text: string): boolean {
  const t = text.trim()
  if (/[?؟]$/u.test(t)) return true
  return QUESTION_START.has(fold(t).split(/[^\p{L}\p{N}]+/u).find(Boolean) ?? '')
}

/** What Pirikoo could do for these words. Guests only get steps that make sense without an account. */
export function planFor(text: string, guest: boolean): Step[] {
  const steps = plan(text)
  return guest ? steps.filter((s) => s.type === 'locale' || s.type === 'theme') : steps
}

export function useStepLabel() {
  const { t, i18n } = useTranslation()
  return (s: Step): string => {
    switch (s.type) {
      case 'go': return t(`pirikoo.plan.steps.${s.to}`)
      case 'audience': return t('pirikoo.plan.steps.audience', { value: t(`ice.filters.audiences.${s.value}`) })
      case 'tone': return t('pirikoo.plan.steps.tone', { value: t(`ice.filters.tones.${s.value}`) })
      case 'kind': return t('pirikoo.plan.steps.kind', { value: t(`ice.filters.kinds.${s.value}`) })
      case 'kidsSafe': return t('pirikoo.plan.steps.kidsSafe')
      case 'deal': return t('pirikoo.plan.steps.deal')
      case 'people': return t('pirikoo.plan.steps.people', { names: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(s.names) })
      case 'start': return t('pirikoo.plan.steps.start')
      case 'ask': return t('pirikoo.plan.steps.ask', { theme: s.theme })
      case 'locale': return t('pirikoo.plan.steps.locale', { value: t(`common.languages.${s.value}`) })
      case 'theme': return t('pirikoo.plan.steps.theme', { value: t(`settings.themes.${s.value}`) })
    }
  }
}

/** Runs a checked plan, in order: settings first, then where to go, then what to do there. */
export function useRunPlan() {
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
