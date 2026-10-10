import { classifyMediaError, mediaSupported } from './media'

const fail = (name: string) => Object.assign(new Error('x'), { name })

afterEach(() => vi.unstubAllGlobals())

describe('classifyMediaError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['OverconstrainedError', 'no-device'],
    ['NotReadableError', 'busy'],
    ['AbortError', 'busy'],
    ['SecurityError', 'blocked'],
    ['SomethingElse', 'busy'],
  ])('%s is %s', (name, problem) => {
    expect(classifyMediaError(fail(name))).toBe(problem)
  })
  it('copes with a thrown non-error', () => {
    expect(classifyMediaError(null)).toBe('busy')
    expect(classifyMediaError('boom')).toBe('busy')
  })
})

describe('feature detection', () => {
  it('needs RTCPeerConnection and getUserMedia', () => {
    vi.stubGlobal('RTCPeerConnection', undefined)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => undefined } })
    expect(mediaSupported()).toBe(false)
    vi.stubGlobal('RTCPeerConnection', class {})
    expect(mediaSupported()).toBe(true)
    vi.stubGlobal('navigator', {})
    expect(mediaSupported()).toBe(false)
  })
})
