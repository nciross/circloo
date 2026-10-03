import { fromSlide, moved, timerChoices, withoutOption, type QuestionInput, type SlideView } from './presentations'

const quiz = (correct: string | null): QuestionInput => ({
  kind: 'quiz', question: 'How many days in a week?', options: [{ text: '5' }, { text: '7' }, { text: '10' }], correctOption: correct, timerSeconds: 20,
})

describe('moved', () => {
  it('moves a slide by a number of places', () => {
    expect(moved(['a', 'b', 'c', 'd'], 'c', -2)).toEqual(['c', 'a', 'b', 'd'])
    expect(moved(['a', 'b', 'c', 'd'], 'a', 3)).toEqual(['b', 'c', 'd', 'a'])
  })
  it('leaves the order alone past either end or for an unknown slide', () => {
    expect(moved(['a', 'b'], 'a', -1)).toEqual(['a', 'b'])
    expect(moved(['a', 'b'], 'b', 1)).toEqual(['a', 'b'])
    expect(moved(['a', 'b'], 'z', 1)).toEqual(['a', 'b'])
  })
})

describe('withoutOption', () => {
  it('keeps the correct answer on its option when one above it goes', () => {
    expect(withoutOption(quiz('c'), 0)).toMatchObject({ options: [{ text: '7' }, { text: '10' }], correctOption: 'b' })
  })
  it('keeps the correct answer when one below it goes', () => {
    expect(withoutOption(quiz('a'), 2).correctOption).toBe('a')
  })
  it('marks none when the correct answer itself goes, never a wrong one', () => {
    expect(withoutOption(quiz('b'), 1).correctOption).toBeNull()
  })
  it('leaves polls without a correct answer', () => {
    expect(withoutOption({ ...quiz(null), kind: 'poll' }, 1)).toMatchObject({ options: [{ text: '5' }, { text: '10' }], correctOption: null })
  })
})

describe('timerChoices', () => {
  it('offers the usual timers', () => {
    expect(timerChoices(20)).toEqual([10, 15, 20, 30, 45, 60])
  })
  it('adds a value set elsewhere so it is shown as it is', () => {
    expect(timerChoices(25)).toEqual([10, 15, 20, 25, 30, 45, 60])
  })
})

describe('fromSlide', () => {
  it('turns a quiz slide into form values', () => {
    const slide = {
      id: 's', kind: 'quiz', position: 2, hidden: false, notes: null, image: null, thumbnail: null, question: 'Q?',
      options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], multipleChoice: false, correctOption: 'b', timerSeconds: 30, showFirst: false, showLive: false,
    } as SlideView
    expect(fromSlide(slide)).toEqual({
      kind: 'quiz', question: 'Q?', options: [{ text: 'x' }, { text: 'y' }], multipleChoice: false, correctOption: 'b', timerSeconds: 30, showFirst: false, showLive: false,
    })
  })
})
