import { describe, expect, it } from 'vitest'
import { compose, seatsFor } from './compose'

describe('compose', () => {
  it('reads a team retro in French with a head count and a language', () => {
    const c = compose('A retro for my team of 6, in French', 'en')
    expect(c).toEqual({ name: 'retro', audience: 'team', people: 6, activities: ['quick-question', 'start-stop-continue'], locale: 'fr' })
  })

  it('keeps kids safe at a family lunch and opens with an icebreaker', () => {
    const c = compose('Sunday lunch with the family, something silly for the kids', 'en')
    expect(c.audience).toBe('family')
    expect(c.people).toBe(5)
    expect(c.activities[0]).toBe('joke-round')
    expect(c.activities).toContain('riddle-time')
    expect(c.name).toBe('kids')
    expect(c.locale).toBe('en')
  })

  it('hears a game night with friends', () => {
    const c = compose('Game night with 5 friends: jokes and a would-you-rather', 'en')
    expect(c).toMatchObject({ audience: 'friends', people: 5, name: 'friends' })
    expect(c.activities).toEqual(['would-you-rather', 'joke-round'])
  })

  it('speaks French, Spanish and Arabic', () => {
    expect(compose('Une rétro pour mon équipe de 8', 'fr')).toMatchObject({ audience: 'team', people: 8, activities: ['quick-question', 'start-stop-continue'], locale: 'fr' })
    expect(compose('Lluvia de ideas con mis compañeros, luego votar', 'es')).toMatchObject({ audience: 'team', name: 'brainstorm' })
    expect(compose('Lluvia de ideas con mis compañeros, luego votar', 'es').activities).toEqual(['quick-question', 'quick-poll', 'brainstorm'])
    expect(compose('عصف ذهني مع الفريق ثم تصويت', 'ar')).toMatchObject({ audience: 'team', locale: 'ar' })
    expect(compose('نكت مع الأصدقاء', 'ar')).toMatchObject({ audience: 'friends', activities: ['joke-round'] })
  })

  it('falls back to a sensible circle when the line says little', () => {
    expect(compose('', 'en')).toEqual({ name: 'friends', audience: 'friends', people: 6, activities: ['joke-round', 'would-you-rather'], locale: 'en' })
    expect(compose('Monday', 'es')).toMatchObject({ audience: 'friends', locale: 'es' })
    expect(compose('something for the team', 'en').activities).toEqual(['quick-question', 'start-stop-continue'])
    expect(compose('how does everyone feel today', 'en')).toMatchObject({ audience: 'family', name: 'mood', activities: ['quick-question', 'mood-weather'] })
  })

  it('caps the picks at four, keeps the icebreaker first and ignores silly numbers', () => {
    const c = compose('retro, brainstorm, kudos, feedback, slides, poll for 250 people', 'en')
    expect(c.activities).toHaveLength(4)
    expect(c.activities[0]).toBe('quick-question')
    expect(c.people).toBe(8)
    expect(compose('Q&A with the team of three', 'en')).toMatchObject({ people: 3, activities: ['quick-question', 'qa'] })
  })

  it('draws at most eight seats and counts the rest', () => {
    expect(seatsFor(3)).toEqual({ shown: 3, more: 0 })
    expect(seatsFor(8)).toEqual({ shown: 8, more: 0 })
    expect(seatsFor(30)).toEqual({ shown: 8, more: 22 })
  })
})
