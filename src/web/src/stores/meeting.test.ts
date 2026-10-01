import { MAX_PEOPLE, shuffle, useMeetingStore } from './meeting'

const reset = () => useMeetingStore.setState({ names: [], order: [], turn: 0, phase: 'gathering', timer: 60 })

describe('meeting mode (US3, FR-112)', () => {
  beforeEach(reset)

  it('gives every person exactly one turn, in a random order, then finishes', () => {
    const s = useMeetingStore.getState()
    for (const n of ['Amina', 'Théo', 'Lucía', 'Youssef']) s.addName(n)
    useMeetingStore.getState().start()
    const { order } = useMeetingStore.getState()
    expect([...order].sort()).toEqual(['Amina', 'Lucía', 'Théo', 'Youssef'].sort())

    const turns: string[] = []
    while (useMeetingStore.getState().phase === 'round') {
      const st = useMeetingStore.getState()
      turns.push(st.order[st.turn]!)
      st.next()
    }
    expect(turns).toEqual(order)
    expect(useMeetingStore.getState().phase).toBe('done')
  })

  it('refuses blanks, duplicates (any case) and more than the limit', () => {
    const s = useMeetingStore.getState()
    expect(s.addName('  ')).toBe('empty')
    expect(s.addName('Amina')).toBe('added')
    expect(useMeetingStore.getState().addName('amina')).toBe('duplicate')
    for (let i = 0; i < MAX_PEOPLE + 5; i++) useMeetingStore.getState().addName(`P${i}`)
    expect(useMeetingStore.getState().names).toHaveLength(MAX_PEOPLE)
    expect(useMeetingStore.getState().addName('Late')).toBe('full')
  })

  it('needs at least two people to start', () => {
    useMeetingStore.getState().addName('Solo')
    useMeetingStore.getState().start()
    expect(useMeetingStore.getState().phase).toBe('gathering')
  })

  it('removing the current person keeps the round valid', () => {
    for (const n of ['A', 'B', 'C']) useMeetingStore.getState().addName(n)
    useMeetingStore.getState().start()
    const last = useMeetingStore.getState().order[2]!
    useMeetingStore.setState({ turn: 2 })
    useMeetingStore.getState().removeName(last)
    expect(useMeetingStore.getState().turn).toBe(1)
    expect(useMeetingStore.getState().phase).toBe('done')
  })

  it('removing someone who already went does not skip the current person', () => {
    for (const n of ['A', 'B', 'C', 'D']) useMeetingStore.getState().addName(n)
    useMeetingStore.getState().start()
    useMeetingStore.setState({ turn: 2 })
    const { order } = useMeetingStore.getState()
    useMeetingStore.getState().removeName(order[0]!)
    const st = useMeetingStore.getState()
    expect(st.order[st.turn]).toBe(order[2])
  })

  it('someone added during a round joins the end of the line and gets a turn', () => {
    for (const n of ['A', 'B']) useMeetingStore.getState().addName(n)
    useMeetingStore.getState().start()
    expect(useMeetingStore.getState().addName('Late')).toBe('added')
    expect(useMeetingStore.getState().order.at(-1)).toBe('Late')
    useMeetingStore.getState().next()
    useMeetingStore.getState().next()
    const st = useMeetingStore.getState()
    expect(st.phase).toBe('round')
    expect(st.order[st.turn]).toBe('Late')
  })

  it('someone added after the round ends gets their own turn', () => {
    for (const n of ['A', 'B']) useMeetingStore.getState().addName(n)
    useMeetingStore.getState().start()
    useMeetingStore.getState().next()
    useMeetingStore.getState().next()
    expect(useMeetingStore.getState().phase).toBe('done')
    useMeetingStore.getState().addName('Late')
    const st = useMeetingStore.getState()
    expect(st.phase).toBe('round')
    expect(st.order[st.turn]).toBe('Late')
  })

  it('shuffle is a permutation and uses the injected randomness', () => {
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1])
    expect(shuffle(['x'])).toEqual(['x'])
  })
})
