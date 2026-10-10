import { browserFamily, classifyMediaError, mediaSupported } from './media'

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

describe('browserFamily', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', false, 'chromium'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', false, 'chromium'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', true, 'android'],
    ['Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0', true, 'android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0', false, 'firefox'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', false, 'safari'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', true, 'ios'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1', true, 'ios'],
    ['Mozilla/5.0 (win32) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/26.0.0', false, 'other'],
  ])('%s is %s', (ua, touch, family) => {
    expect(browserFamily(ua, touch)).toBe(family)
  })
})
