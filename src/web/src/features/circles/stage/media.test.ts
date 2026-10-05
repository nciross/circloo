import { classifyMediaError, mediaSupported, openMedia, requestTrack } from './media'
import { FakeTrack, asTrack } from './fakes'

const fail = (name: string) => Object.assign(new Error('x'), { name })

function setDevices(getUserMedia: (c: MediaStreamConstraints) => Promise<unknown> | undefined) {
  vi.stubGlobal('RTCPeerConnection', class {})
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(getUserMedia) } })
  return (navigator.mediaDevices.getUserMedia as unknown) as ReturnType<typeof vi.fn>
}

const streamOf = (kind: 'audio' | 'video') => {
  const t = asTrack(new FakeTrack(kind))
  return { getAudioTracks: () => (kind === 'audio' ? [t] : []), getVideoTracks: () => (kind === 'video' ? [t] : []), getTracks: () => [t] }
}

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
    setDevices(() => undefined)
    expect(mediaSupported()).toBe(true)
    vi.stubGlobal('navigator', {})
    expect(mediaSupported()).toBe(false)
  })

  it('answers unsupported without asking for anything', async () => {
    vi.stubGlobal('RTCPeerConnection', undefined)
    vi.stubGlobal('navigator', {})
    expect(await requestTrack('audio')).toEqual({ ok: false, problem: 'unsupported' })
  })
})

describe('requestTrack', () => {
  it('asks for one kind with 640x360 at 24 fps for video and returns the track', async () => {
    const gum = setDevices((c) => Promise.resolve(streamOf(c.video ? 'video' : 'audio')))
    const v = await requestTrack('video')
    expect(v.ok && v.track.kind).toBe('video')
    expect(gum).toHaveBeenCalledWith({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } } })
    await requestTrack('audio')
    expect(gum).toHaveBeenLastCalledWith({ audio: true })
  })

  it('returns the classified problem as a typed result', async () => {
    setDevices(() => Promise.reject(fail('NotAllowedError')))
    expect(await requestTrack('audio')).toEqual({ ok: false, problem: 'denied' })
  })

  it('stops a stream that has no track of the kind', async () => {
    const stopped = vi.fn()
    setDevices(() => Promise.resolve({ getAudioTracks: () => [], getVideoTracks: () => [], getTracks: () => [{ stop: stopped }] }))
    expect(await requestTrack('audio')).toEqual({ ok: false, problem: 'no-device' })
    expect(stopped).toHaveBeenCalled()
  })
})

describe('openMedia', () => {
  it('never asks for both kinds at once', async () => {
    const gum = setDevices((c) => Promise.resolve(streamOf(c.video ? 'video' : 'audio')))
    const m = await openMedia({ audio: true, video: true })
    expect(m.audio && m.video && m.problem === null).toBeTruthy()
    expect(gum).toHaveBeenCalledTimes(2)
    for (const [c] of gum.mock.calls as [MediaStreamConstraints][]) expect(!!c.audio !== !!c.video).toBe(true)
  })

  it('falls back to audio only when the camera fails, keeping the reason', async () => {
    setDevices((c) => (c.video ? Promise.reject(fail('NotFoundError')) : Promise.resolve(streamOf('audio'))))
    const m = await openMedia({ audio: true, video: true })
    expect(m.audio).not.toBeNull()
    expect(m.video).toBeNull()
    expect(m.problem).toBe('no-device')
  })

  it('a refused microphone does not block the camera request', async () => {
    const gum = setDevices((c) => (c.audio ? Promise.reject(fail('NotAllowedError')) : Promise.resolve(streamOf('video'))))
    const m = await openMedia({ audio: true, video: true })
    expect(m.audio).toBeNull()
    expect(m.video).not.toBeNull()
    expect(m.problem).toBe('denied')
    expect(gum).toHaveBeenCalledTimes(2)
  })

  it('asks for nothing when nothing is wanted', async () => {
    const gum = setDevices(() => undefined)
    expect(await openMedia({ audio: false, video: false })).toEqual({ audio: null, video: null, problem: null })
    expect(gum).not.toHaveBeenCalled()
  })
})
