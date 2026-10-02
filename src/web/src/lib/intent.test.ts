import { describe, expect, it } from 'vitest'
import { plan } from './intent'
import en from '../i18n/locales/en.json'
import fr from '../i18n/locales/fr.json'
import es from '../i18n/locales/es.json'
import ar from '../i18n/locales/ar.json'

describe('Ask bar planner', () => {
  it('plans a filtered deal in each language', () => {
    expect(plan('A silly icebreaker for the family')).toEqual([
      { type: 'go', to: 'icebreakers' },
      { type: 'audience', value: 'family' },
      { type: 'tone', value: 'silly' },
      { type: 'kind', value: 'icebreaker' },
      { type: 'deal' },
    ])
    expect(plan('Une blague rigolote pour les enfants')).toEqual([
      { type: 'go', to: 'icebreakers' },
      { type: 'tone', value: 'silly' },
      { type: 'kind', value: 'joke' },
      { type: 'kidsSafe' },
      { type: 'deal' },
    ])
    expect(plan('سؤال دافئ لكسر الجليد مع العائلة')).toContainEqual({ type: 'audience', value: 'family' })
    expect(plan('سؤال دافئ لكسر الجليد مع العائلة')).toContainEqual({ type: 'tone', value: 'cozy' })
    expect(plan('Una adivinanza profunda para el equipo')).toContainEqual({ type: 'kind', value: 'riddle' })
  })

  it('puts people in the line and starts the round', () => {
    expect(plan('Round with Amina, Théo and Lucía')).toEqual([
      { type: 'go', to: 'icebreakers' },
      { type: 'deal' },
      { type: 'people', names: ['Amina', 'Théo', 'Lucía'] },
      { type: 'start' },
    ])
    expect(plan('جولة مع أمينة وتيو ولوسيا')).toContainEqual({ type: 'people', names: ['أمينة', 'تيو', 'لوسيا'] })
    expect(plan('Un tour avec Zoé et Malo')).toContainEqual({ type: 'start' })
  })

  it('asks for fresh cards about a theme without mistaking cards for people', () => {
    const steps = plan('A silly round with fresh AI cards about holidays')
    expect(steps).toContainEqual({ type: 'ask', theme: 'holidays' })
    expect(steps.some((s) => s.type === 'people')).toBe(false)
    expect(steps.some((s) => s.type === 'deal')).toBe(false)
    expect(plan('Tarjetas de IA sobre el verano')).toContainEqual({ type: 'ask', theme: 'el verano' })
  })

  it('switches language and theme, but a time of day is not a theme', () => {
    expect(plan('Switch to night swim')).toEqual([{ type: 'theme', value: 'dark' }])
    expect(plan('Passer en baignade de nuit')).toEqual([{ type: 'theme', value: 'dark' }])
    expect(plan('انتقل إلى السباحة الليلية')).toEqual([{ type: 'theme', value: 'dark' }])
    expect(plan('dark mode')).toEqual([{ type: 'theme', value: 'dark' }])
    expect(plan('Passer en mode sombre')).toEqual([{ type: 'theme', value: 'dark' }])
    expect(plan('انتقل إلى الوضع الداكن')).toEqual([{ type: 'theme', value: 'dark' }])
    expect(plan('light mode')).toEqual([{ type: 'theme', value: 'light' }])
    expect(plan('Una ronda para esta noche').some((s) => s.type === 'theme')).toBe(false)
    expect(plan('in French please')).toEqual([{ type: 'locale', value: 'fr' }])
  })

  it('navigates, and returns nothing it cannot do', () => {
    expect(plan('open settings')).toEqual([{ type: 'go', to: 'settings' }])
    expect(plan('Accueil')).toEqual([{ type: 'go', to: 'home' }])
    expect(plan('order a pizza')).toEqual([])
    expect(plan('   ')).toEqual([])
  })

  it('turns every example the Ask bar offers, in every language, into a plan', () => {
    for (const locale of [en, fr, es, ar]) {
      for (const example of [...locale.pirikoo.plan.examples, ...locale.home.suggest.items]) expect(plan(example).length, example).toBeGreaterThan(0)
    }
  })
})
