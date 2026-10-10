import { afterEach, describe, expect, it, vi } from 'vitest'
import { markPrimed, needsPrimer, permissionState, primed, resetPrimer } from './primer'

function permissions(query: (d: { name: string }) => Promise<{ state: string }>) {
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } })
}

afterEach(() => {
  resetPrimer()
  delete (navigator as { permissions?: unknown }).permissions
  vi.useRealTimers()
})

describe('primer', () => {
  it('shows once per device kind in the session', async () => {
    permissions(() => Promise.resolve({ state: 'prompt' }))
    expect(await needsPrimer('audio')).toBe(true)
    markPrimed('audio')
    expect(await needsPrimer('audio')).toBe(false)
    expect(await needsPrimer('video')).toBe(true)
    expect(JSON.parse(sessionStorage.getItem('circloo.call.primed')!)).toEqual(['audio'])
  })

  it('survives a reload of the page in the same tab', () => {
    sessionStorage.setItem('circloo.call.primed', JSON.stringify(['video', 'junk']))
    expect(primed('video')).toBe(true)
    expect(primed('audio')).toBe(false)
  })

  it('is skipped when the browser will not ask: already allowed, or already refused', async () => {
    permissions(() => Promise.resolve({ state: 'granted' }))
    expect(await needsPrimer('audio')).toBe(false)
    permissions(() => Promise.resolve({ state: 'denied' }))
    expect(await needsPrimer('video')).toBe(false)
  })

  it('asks the browser about the right device', async () => {
    const query = vi.fn((d: { name: string }) => Promise.resolve({ state: d.name ? 'prompt' : 'denied' }))
    permissions(query)
    await permissionState('audio')
    await permissionState('video')
    expect(query.mock.calls.map(([d]) => d.name)).toEqual(['microphone', 'camera'])
  })

  it('shows when the browser cannot say, refuses the question, or is slow', async () => {
    expect(await needsPrimer('audio')).toBe(true)
    permissions(() => Promise.reject(new TypeError('camera is not a valid PermissionName')))
    expect(await needsPrimer('audio')).toBe(true)
    vi.useFakeTimers()
    permissions(() => new Promise(() => {}))
    const answer = needsPrimer('video')
    await vi.advanceTimersByTimeAsync(500)
    expect(await answer).toBe(true)
  })
})
