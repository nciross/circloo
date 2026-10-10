import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HubConnection } from '@microsoft/signalr'
import i18n from '../../../i18n'
import {
  MAX_MOVING, SEND_WINDOW, WAVE_MS, bindReactions, cleanBurst, diffCounts, foldWaves, jitter, liveWaves, sendWindow, spawn, summarize, useReactions,
  type ReactionKind,
} from './reactions'

const say = (lng: string) => (kind: ReactionKind, count: number) => i18n.getFixedT(lng)(`circles.reactions.say.${kind}`, { count })

afterEach(() => {
  useReactions.getState().reset()
  vi.useRealTimers()
})

describe('reaction bursts', () => {
  it('keeps known kinds with whole positive counts only', () => {
    expect(cleanBurst({ clap: 3, heart: 0, wow: -1, laugh: 2.7, party: 'x', boo: 4 })).toEqual({ clap: 3, laugh: 2 })
    expect(cleanBurst(null)).toEqual({})
    expect(cleanBurst({ like: 1e9 })).toEqual({ like: 10_000 })
  })

  it('groups a kind while it keeps coming and starts again once it went quiet', () => {
    let waves = foldWaves({}, { clap: 12 }, 0)
    waves = foldWaves(waves, { clap: 28, heart: 1 }, 400)
    expect(waves).toEqual({ clap: { count: 40, at: 400 }, heart: { count: 1, at: 400 } })
    expect(liveWaves(waves, 400 + WAVE_MS)).toEqual({})
    expect(foldWaves(waves, { clap: 2 }, 400 + WAVE_MS).clap).toEqual({ count: 2, at: 400 + WAVE_MS })
  })

  it('lets at most the free slots move, a fair share per kind, biggest first', () => {
    expect(spawn({ clap: 40 }, MAX_MOVING)).toHaveLength(MAX_MOVING)
    expect(spawn({ clap: 40, heart: 1 }, 4)).toEqual(['clap', 'heart', 'clap', 'clap'])
    expect(spawn({ wow: 2 }, 12)).toEqual(['wow', 'wow'])
    expect(spawn({ clap: 5 }, 0)).toEqual([])
  })

  it('draws stable lanes', () => {
    expect(jitter(3, 1)).toBe(jitter(3, 1))
    for (let i = 0; i < 50; i++) {
      const r = jitter(i, i * 7)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(1)
    }
  })

  it('counts only what is new since the last summary', () => {
    expect(diffCounts({ clap: 10, heart: 2 }, { clap: 4, heart: 2 })).toEqual({ clap: 6 })
    // After a reset everything received counts as new.
    expect(diffCounts({ clap: 3 }, { clap: 9 })).toEqual({ clap: 3 })
  })
})

describe('the spoken summary', () => {
  it('says the biggest first, in words, in each language', () => {
    expect(summarize({ heart: 3, clap: 12 }, say('en'), 'en')).toBe('12 applause, 3 hearts')
    expect(summarize({ clap: 1 }, say('fr'), 'fr')).toBe('1 applaudissement')
    expect(summarize({ heart: 2, laugh: 5 }, say('es'), 'es')).toMatch(/^5 risas.*2 corazones$/)
    expect(summarize({ clap: 2, heart: 3 }, say('ar'), 'ar')).toMatch(/^3 قلوب.*تصفيقتان$/)
    expect(summarize({}, say('en'), 'en')).toBe('')
  })
})

describe('the send window', () => {
  it('rests after five taps in ten seconds and frees again', () => {
    let now = 1_000
    const w = sendWindow(() => now)
    for (let i = 0; i < 5; i++) {
      expect(w.take()).toBe(true)
      now += 100
    }
    expect(w.take()).toBe(false)
    expect(w.restFor()).toBe(1_000 + SEND_WINDOW - now)
    now = 1_000 + SEND_WINDOW
    expect(w.restFor()).toBe(0)
    expect(w.take()).toBe(true)
  })
})

describe('the reactions store', () => {
  it('keeps the latest bursts with growing ids, the waves and the totals, and forgets everything on reset', () => {
    vi.useFakeTimers()
    const now = Date.now()
    useReactions.getState().receive({ clap: 2 }, now)
    useReactions.getState().receive({ clap: 3, heart: 1 }, now + 400)
    useReactions.getState().receive({ nope: 1 }, now + 500)
    const s = useReactions.getState()
    expect(s.bursts.map((b) => b.burst)).toEqual([{ clap: 2 }, { clap: 3, heart: 1 }])
    expect(s.bursts[1]!.id).toBeGreaterThan(s.bursts[0]!.id)
    expect(s.waves.clap?.count).toBe(5)
    expect(s.totals).toEqual({ clap: 5, heart: 1 })
    // The chips leave once their wave is over.
    vi.advanceTimersByTime(400 + WAVE_MS + 100)
    expect(useReactions.getState().waves).toEqual({})
    useReactions.getState().reset()
    expect(useReactions.getState()).toMatchObject({ bursts: [], waves: {}, totals: {} })
  })
})

describe('bindReactions', () => {
  function bind(keep?: () => boolean) {
    const handlers = new Map<string, (...a: unknown[]) => void>()
    const connection = { on: (name: string, h: (...a: unknown[]) => void) => void handlers.set(name, h) } as unknown as HubConnection
    let current = true
    bindReactions(connection, () => current, keep)
    return { fire: (name: string, ...a: unknown[]) => handlers.get(name)?.(...a), stale: () => (current = false) }
  }

  it('keeps the reactions when the presentation ends during a call (spec 009 US8), and resets them otherwise', () => {
    let callOn = true
    const hub = bind(() => callOn)
    hub.fire('Reactions', { clap: 3 })
    hub.fire('PresentationEnded')
    expect(useReactions.getState().totals).toEqual({ clap: 3 })
    callOn = false
    hub.fire('PresentationEnded')
    expect(useReactions.getState().totals).toEqual({})
  })

  it('ignores a replaced connection', () => {
    const hub = bind()
    hub.stale()
    hub.fire('Reactions', { clap: 1 })
    expect(useReactions.getState().bursts).toEqual([])
  })
})
