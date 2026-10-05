import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOTION_KEY, motionOn, readOptIn, resetMotionMemory, setOptIn, systemReduced } from './motion'

const media = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
  resetMotionMemory()
})

describe('landing motion preference', () => {
  it('follows the system by default', () => {
    media(false)
    expect(motionOn(systemReduced(), readOptIn())).toBe(true)
    media(true)
    expect(systemReduced()).toBe(true)
    expect(motionOn(systemReduced(), readOptIn())).toBe(false)
  })

  it('lets a reduced-motion visitor opt in, remembered in the browser', () => {
    media(true)
    setOptIn(true)
    expect(window.localStorage.getItem(MOTION_KEY)).toBe('1')
    expect(readOptIn()).toBe(true)
    expect(motionOn(systemReduced(), readOptIn())).toBe(true)
    setOptIn(false)
    expect(window.localStorage.getItem(MOTION_KEY)).toBeNull()
    expect(motionOn(systemReduced(), readOptIn())).toBe(false)
  })

  it('renders without a stored choice and survives blocked storage', () => {
    media(true)
    expect(readOptIn()).toBe(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readOptIn()).toBe(false)
    expect(() => setOptIn(true)).not.toThrow()
    expect(motionOn(systemReduced(), true)).toBe(true)
  })

  it('treats a missing matchMedia as no reduction', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(systemReduced()).toBe(false)
  })
})
