import { historyOf, type ChatItem } from '../../stores/pirikoo'
import { isQuestion, planFor } from './planning'

describe('Pirikoo: answer or plan (issue #88)', () => {
  it('tells questions from instructions in four languages', () => {
    for (const q of ['How do I invite people?', 'comment inviter des gens', '¿Cómo invito a la gente?', 'كيف أدعو الناس', 'Is this circle private?', 'what should I do next']) {
      expect(isQuestion(q), q).toBe(true)
    }
    for (const i of ['Switch to dark mode', 'A silly icebreaker for the family', 'Passe en mode sombre', 'Cambiar a modo oscuro']) {
      expect(isQuestion(i), i).toBe(false)
    }
  })

  it('offers guests only the steps that work without an account', () => {
    expect(planFor('A silly icebreaker for the family', false).length).toBeGreaterThan(0)
    expect(planFor('A silly icebreaker for the family', true)).toEqual([])
    expect(planFor('Switch to dark mode', true)).toEqual([{ type: 'theme', value: 'dark' }])
  })

  it('sends the server only finished turns, the latest twelve, each bounded', () => {
    const items: ChatItem[] = [
      { id: 'a', role: 'user', text: 'Hi' },
      { id: 'b', role: 'pirikoo', text: 'Hello!', state: 'done' },
      { id: 'c', role: 'user', text: 'Swear at me' },
      { id: 'd', role: 'pirikoo', text: 'Let’s keep it kind.', state: 'done', replaced: true },
      { id: 'e', role: 'pirikoo', text: '', state: 'error', error: 'failed' },
      { id: 'f', role: 'pirikoo', text: '', state: 'done', plan: [{ type: 'theme', value: 'dark' }] },
      { id: 'g', role: 'pirikoo', text: 'Half an ans', state: 'stopped' },
    ]
    expect(historyOf(items)).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'pirikoo', text: 'Hello!' },
      { role: 'user', text: 'Swear at me' },
    ])

    const long = Array.from({ length: 20 }, (_, i): ChatItem => ({ id: `${i}`, role: 'user', text: `${i} ${'x'.repeat(2000)}` }))
    const sent = historyOf(long)
    expect(sent).toHaveLength(12)
    expect(sent[0]?.text.startsWith('8 ')).toBe(true)
    expect(sent.every((t) => t.text.length <= 1500)).toBe(true)
  })
})
