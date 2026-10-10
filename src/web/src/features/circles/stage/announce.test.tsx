import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import i18n from '../../../i18n'
import type { DiscussionState, HandsView, Member } from '../../../api/circles'
import { CALL_NOTICE_KINDS, type CallNoticeKind } from '../../../api/discussion'
import { useRoom } from '../room'
import { HANDS_EVERY, HANDS_GATHER, NO_HANDS, myHand } from '../room/hands'
import { callSay, sentence, type Batch, type Listener } from './announce'
import { CallAnnouncer } from './CallAnnouncer'
import { resetStage, useStage, type CallNotice, type CallParticipant } from './stage'

// Spec 009 T914 (US7 #2, FR-925, SC-908): one polite, grouped voice for the call and the hands. Call started or ended,
// the floor, me muted or allowed, me removed; hands as in spec 008; never one sentence per event in a burst and never
// one per active speaker change.

const nadia: Member = { id: 'n', name: 'Nadia', role: 'animator', character: 'panda', ring: 0 }
const amina: Member = { id: 'a', name: 'Amina', role: 'participant', character: 'fox', ring: 0 }
const theo: Member = { id: 'th', name: 'Théo', role: 'participant', character: 'owl', ring: 0 }
const kenji: Member = { id: 'k', name: 'Kenji', role: 'participant', character: 'chick', ring: 0 }
const members = [nadia, amina, theo, kenji]

const t = i18n.getFixedT('en')
let id = 1000
const notice = (kind: CallNoticeKind, by: string | null = 'n', subject: string | null = null): CallNotice => ({ id: ++id, kind, byMemberId: by, subjectMemberId: subject })
const hands = (queue: string[], floor: string | null = null): HandsView => ({
  queue: queue.map((memberId) => ({ memberId, raisedAt: '2026-10-09T10:00:00Z' })),
  floor,
})
const call = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: true, videoAllowed: true, speaking: 'hand', available: true, away: 'none', awayEndsAt: null, ...over })
const names = new Map(members.map((m) => [m.id, m.name]))
const as = (me: Member, lng = 'en'): Listener => ({ meId: me.id, isAnimator: me.role === 'animator', nameOf: (x) => names.get(x) ?? '', lng })
const batch = (over: Partial<Batch> & { me?: string; told?: HandsView } = {}): Batch => {
  const now = over.hands ?? NO_HANDS
  return {
    notices: [],
    raised: [],
    hands: now,
    mine: { told: myHand(over.told ?? NO_HANDS, over.me ?? 'a'), now: myHand(now, over.me ?? 'a') },
    floorTold: undefined,
    ...over,
  }
}

describe('callSay', () => {
  it('says a burst of notices as one announcement, the latest of two opposites only', () => {
    const text = callSay(t, batch({ notices: [notice('call-started'), notice('video-on'), notice('video-off'), notice('mode-hand')] }), as(amina))
    expect(text).toBe(
      'The animator started a call. Join when you are ready. Video is off. The call goes on with voices. Hand to speak: raise your hand and wait for the floor.',
    )
  })

  it('says the floor given to you once, from the notice, not from the hands as well', () => {
    const text = callSay(t, batch({ notices: [notice('floor-given', 'n', 'a')], told: hands(['a']), hands: hands([], 'a'), floorTold: null }), as(amina))
    expect(text).toBe('You have the floor. Switch your microphone on when you are ready.')
  })

  it('tells everyone in a call who has the floor and when the turn is over', () => {
    expect(callSay(t, batch({ told: hands(['th', 'a']), hands: hands(['a'], 'th'), floorTold: null }), as(amina))).toBe('Théo has the floor. You are 1st.')
    expect(callSay(t, batch({ told: hands(['a'], 'th'), hands: hands(['a']), floorTold: 'th' }), as(amina))).toBe('Théo’s turn is over.')
    // Outside a call (floorTold undefined), spec 008: only your own place.
    expect(callSay(t, batch({ told: hands(['th', 'a']), hands: hands(['a'], 'th') }), as(amina))).toBe('You are 1st.')
  })

  it('says me muted, allowed again, and removed, and a removal takes the rest of what concerned me with it', () => {
    expect(callSay(t, batch({ notices: [notice('mic-muted', 'n', 'a')] }), as(amina))).toBe('The animator switched your microphone off. You can still listen and chat.')
    expect(callSay(t, batch({ notices: [notice('mic-muted', 'n', 'a'), notice('mic-allowed', 'n', 'a')] }), as(amina))).toBe('You can use your microphone again.')
    const removed = callSay(
      t,
      batch({ notices: [notice('floor-taken', 'n', 'a'), notice('removed', 'n', 'a')], told: hands([], 'a'), hands: NO_HANDS, floorTold: 'a' }),
      as(amina),
    )
    expect(removed).toBe('The animator took you out of this call. You are still in the circle and its chat.')
  })

  it('says only that the call ended when it ends, not the hands it took down', () => {
    const text = callSay(t, batch({ notices: [notice('mode-open'), notice('call-ended')], told: hands(['a'], 'th'), hands: NO_HANDS, floorTold: 'th' }), as(amina))
    expect(text).toBe('The animator ended the call.')
  })

  it('tells the animator hands that went up and nothing they did themselves', () => {
    const text = callSay(t, batch({ notices: [notice('video-off', 'n'), notice('mode-open', 'n')], raised: ['th', 'k', 'a'], hands: hands(['th', 'k']) }), as(nadia))
    // Amina raised and lowered within the batch: not news.
    expect(text).toBe('Théo and Kenji raised their hands.')
  })

  it('has words for every notice and the hands in every language, never a key', () => {
    for (const lng of ['en', 'fr', 'ar', 'es']) {
      const tl = i18n.getFixedT(lng)
      for (const kind of CALL_NOTICE_KINDS) {
        const text = callSay(tl, batch({ notices: [notice(kind, 'n', 'a')] }), as(amina, lng))
        expect(text, `${lng} ${kind}`).toBeTruthy()
        expect(text, `${lng} ${kind}`).not.toMatch(/circles\./)
      }
      const floor = callSay(tl, batch({ told: hands(['th']), hands: hands([], 'th'), floorTold: null }), as(amina, lng))
      expect(floor, lng).toContain('Théo')
      expect(floor, lng).not.toMatch(/circles\./)
    }
  })

  it('ends each sentence with a stop', () => {
    expect(sentence('You have the floor')).toBe('You have the floor.')
    expect(sentence('Prêt ?')).toBe('Prêt ?')
    expect(sentence('هل أنت مستعد؟')).toBe('هل أنت مستعد؟')
  })
})

describe('CallAnnouncer', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    vi.useRealTimers()
    resetStage()
    useRoom.setState({ me: null, members: [], hands: NO_HANDS })
  })

  function enter(me: Member, h: HandsView = NO_HANDS, d: DiscussionState | null = null) {
    useRoom.setState({ me, members, hands: h })
    useStage.setState({ discussion: d, notices: [] })
    render(<CallAnnouncer />)
    return screen.getByRole('status')
  }

  it('is one polite status line that says nothing about what was there before you came', () => {
    useStage.setState({ notices: [notice('call-started')] })
    useRoom.setState({ me: amina, members, hands: hands(['th'], 'k') })
    render(<CallAnnouncer />)
    const line = screen.getByRole('status')
    expect(line).not.toHaveAttribute('aria-live', 'assertive')
    act(() => vi.advanceTimersByTime(5000))
    expect(line).toBeEmptyDOMElement()
  })

  it('groups a burst into one announcement and waits a few seconds before the next', () => {
    const line = enter(amina)
    act(() => useStage.setState({ discussion: call(), notices: [notice('call-started')] }))
    act(() => useStage.setState((s) => ({ notices: [...s.notices, notice('mode-open')] })))
    act(() => vi.advanceTimersByTime(HANDS_GATHER))
    expect(line).toHaveTextContent('The animator started a call. Join when you are ready. Open mic: anyone in the call can switch their microphone on.')

    // The next notice comes right after: it is held until HANDS_EVERY has passed since the last announcement.
    act(() => useStage.setState((s) => ({ notices: [...s.notices, notice('muted-everyone')] })))
    act(() => vi.advanceTimersByTime(HANDS_GATHER))
    expect(line).not.toHaveTextContent('switched every microphone off')
    act(() => vi.advanceTimersByTime(HANDS_EVERY - HANDS_GATHER))
    expect(line).toHaveTextContent('The animator switched every microphone off. You can switch yours on again.')
  })

  it('says the floor once to the person given it, and to the others who has it', () => {
    const line = enter(amina, hands(['a', 'th']), call())
    act(() => {
      useRoom.setState({ hands: hands(['th'], 'a') })
      useStage.setState((s) => ({ notices: [...s.notices, notice('floor-given', 'n', 'a')] }))
    })
    act(() => vi.advanceTimersByTime(HANDS_GATHER))
    expect(line).toHaveTextContent(/^You have the floor\. Switch your microphone on when you are ready\.$/)
  })

  it('tells the others who has the floor during a call', () => {
    const line = enter(kenji, hands(['a', 'k']), call())
    act(() => useRoom.setState({ hands: hands(['k'], 'a') }))
    act(() => vi.advanceTimersByTime(HANDS_GATHER))
    expect(line).toHaveTextContent('Amina has the floor. You are 1st.')
  })

  it('never announces who is speaking', () => {
    const line = enter(amina, NO_HANDS, call())
    const person = (id: string, speaking: boolean): CallParticipant =>
      ({ id, name: names.get(id)!, local: id === 'a', speaking, quality: 'good', mic: true, camera: false, video: null })
    for (const who of ['th', 'k', 'th', 'k']) {
      act(() => useStage.setState({ participants: [person('a', false), person('th', who === 'th'), person('k', who === 'k')] }))
      act(() => vi.advanceTimersByTime(800))
    }
    act(() => vi.advanceTimersByTime(HANDS_EVERY))
    expect(line).toBeEmptyDOMElement()
  })

  it('empties the line between announcements, so the same words are heard again', () => {
    const line = enter(amina, NO_HANDS, call())
    act(() => useStage.setState({ notices: [notice('mic-muted', 'n', 'a')] }))
    act(() => vi.advanceTimersByTime(HANDS_GATHER))
    expect(line).not.toBeEmptyDOMElement()
    act(() => vi.advanceTimersByTime(HANDS_EVERY))
    expect(line).toBeEmptyDOMElement()
  })
})
