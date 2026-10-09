import type { CallPass } from '../../../api/discussion'
import { createCallEngine, loadLiveKit, rightsOf, roomOptions, type CallListener } from './call'
import { DisconnectReason, FakePublication, FakeRoom, FakeTrack, RoomEvent, VideoQuality, deviceFailures, fakeLiveKit, resetFakeLiveKit } from './livekit.fake'

const loads = vi.hoisted(() => ({ count: 0 }))
vi.mock('livekit-client', async () => {
  loads.count++
  return (await import('./livekit.fake')).fakeLiveKit
})

const pass: CallPass = { url: 'ws://localhost:7880', token: 'pass-1', identity: 'me', expiresAt: '2026-10-09T10:05:00Z', canSpeak: true, canVideo: true }

function listener() {
  return {
    onConnection: vi.fn(),
    onEnded: vi.fn(),
    onParticipants: vi.fn(),
    onRights: vi.fn(),
    onDevices: vi.fn(),
    onDeviceProblem: vi.fn(),
    onAudioBlocked: vi.fn(),
  } satisfies CallListener
}

/** A screen size the engine can watch, like `matchMedia(COMPACT)`; `set` resizes it. */
function screenOf(compact: boolean) {
  const listeners = new Set<() => void>()
  return {
    matches: compact,
    addEventListener: (_: 'change', cb: () => void) => void listeners.add(cb),
    removeEventListener: (_: 'change', cb: () => void) => void listeners.delete(cb),
    set(next: boolean) {
      this.matches = next
      for (const cb of listeners) cb()
    },
    get watched() {
      return listeners.size
    },
  }
}

async function connected(phone = false, screen: ReturnType<typeof screenOf> | null = null) {
  const l = listener()
  const engine = await createCallEngine(l, { load: () => Promise.resolve(fakeLiveKit), phone, screen })
  await engine.connect(pass)
  const room = FakeRoom.last!
  return { l, engine, room, local: room.localParticipant }
}

let visibility: DocumentVisibilityState = 'visible'
beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})
function setVisibility(v: DocumentVisibilityState) {
  visibility = v
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  resetFakeLiveKit()
  visibility = 'visible'
  document.body.replaceChildren()
})

const domError = (name: string) => Object.assign(new Error(name), { name })
const lastOf = <T>(fn: { mock: { calls: T[][] } }) => fn.mock.calls.at(-1)?.[0]

describe('loading', () => {
  it('loads livekit-client only when asked, once', async () => {
    expect(loads.count).toBe(0)
    const a = await loadLiveKit()
    const b = await loadLiveKit()
    expect(a).toBe(b)
    expect(loads.count).toBe(1)
  })
})

describe('room options (research R25)', () => {
  it('uses adaptive stream, dynacast, two simulcast layers, VP8, DTX, RED and the speech preset', () => {
    const o = roomOptions(fakeLiveKit, false)
    expect(o).toMatchObject({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true })
    expect(o.publishDefaults).toMatchObject({ simulcast: true, videoCodec: 'vp8', dtx: true, red: true, audioPreset: { maxBitrate: 24_000, priority: 'high' } })
    expect(o.publishDefaults?.videoSimulcastLayers?.map((l) => l.resolution.height)).toEqual([180, 360])
    expect(o.videoCaptureDefaults?.resolution?.height).toBe(720)
  })

  it('captures 540p on a phone', () => {
    expect(roomOptions(fakeLiveKit, true).videoCaptureDefaults?.resolution?.height).toBe(540)
  })

  it('sizes received videos at one pixel per CSS pixel on a phone-sized screen, so a tile never asks for 540p (#278)', () => {
    expect(roomOptions(fakeLiveKit, true, true).adaptiveStream).toEqual({ pixelDensity: 1 })
    // A computer keeps adaptive stream's own density, whatever the device.
    expect(roomOptions(fakeLiveKit, true, false).adaptiveStream).toBe(true)
  })

  it('joins with the screen size of the moment', async () => {
    await connected(true, screenOf(true))
    expect((FakeRoom.last!.options as { adaptiveStream: unknown }).adaptiveStream).toEqual({ pixelDensity: 1 })
    await connected(false, screenOf(false))
    expect((FakeRoom.last!.options as { adaptiveStream: unknown }).adaptiveStream).toBe(true)
  })
})

describe('rights', () => {
  it('reads the call server permission, an empty source list meaning every source', () => {
    expect(rightsOf(undefined)).toEqual({ canSpeak: false, canVideo: false })
    expect(rightsOf({ canPublish: false, canPublishSources: [1, 2] })).toEqual({ canSpeak: false, canVideo: false })
    expect(rightsOf({ canPublish: true, canPublishSources: [1] })).toEqual({ canSpeak: false, canVideo: true })
    expect(rightsOf({ canPublish: true, canPublishSources: [] })).toEqual({ canSpeak: true, canVideo: true })
  })
})

describe('connecting', () => {
  it('starts the sound before connecting, with devices off and the server rights reported', async () => {
    const { l, room } = await connected()
    expect(room.audioStarts).toBe(1)
    expect(room.connected).toEqual(['ws://localhost:7880', 'pass-1'])
    expect(lastOf(l.onRights)).toEqual({ canSpeak: true, canVideo: true })
    expect(lastOf(l.onDevices)).toEqual({ mic: false, camera: false })
    expect(room.localParticipant.requests).toEqual([])
  })

  it('reports a blocked sound and plays it again on a tap', async () => {
    const { l, engine, room } = await connected()
    room.canPlaybackAudio = false
    room.emit(RoomEvent.AudioPlaybackStatusChanged, false)
    expect(lastOf(l.onAudioBlocked)).toBe(true)
    room.canPlaybackAudio = true
    await engine.startAudio()
    expect(lastOf(l.onAudioBlocked)).toBe(false)
  })

  it('plays remote voices in a hidden element and describes the people', async () => {
    const { l, room } = await connected()
    const amina = room.addRemote('amina', 'Amina')
    amina.trackPublications.set('microphone', new FakePublication('microphone', new FakeTrack('audio')))
    room.emit(RoomEvent.TrackSubscribed, new FakeTrack('audio'), {}, amina)
    expect(document.querySelector('[data-call="audio"] audio')).not.toBeNull()
    amina.isSpeaking = true
    amina.connectionQuality = 'poor'
    room.emit(RoomEvent.ActiveSpeakersChanged, [amina])
    expect(lastOf(l.onParticipants)).toEqual([
      expect.objectContaining({ id: 'me', local: true, speaking: false, video: null }),
      expect.objectContaining({ id: 'amina', name: 'Amina', local: false, speaking: true, quality: 'poor' }),
    ])
  })

  it('stops showing someone as speaking as soon as their microphone is muted, before the next speaker update (#276)', async () => {
    const { l, room } = await connected()
    const amina = room.addRemote('amina', 'Amina')
    const mic = new FakePublication('microphone', new FakeTrack('audio'))
    amina.trackPublications.set('microphone', mic)
    amina.isSpeaking = true
    room.emit(RoomEvent.ActiveSpeakersChanged, [amina])
    expect(lastOf(l.onParticipants).find((p: { id: string }) => p.id === 'amina')).toMatchObject({ speaking: true, mic: true })
    // The call server says the microphone is muted; its audio levels still call her a speaker for a while.
    mic.isMuted = true
    room.emit(RoomEvent.TrackMuted, mic, amina)
    expect(amina.isSpeaking).toBe(true)
    expect(lastOf(l.onParticipants).find((p: { id: string }) => p.id === 'amina')).toMatchObject({ speaking: false, mic: false })
    // Unmuted, she is a speaker again only when the call server hears her.
    mic.isMuted = false
    amina.isSpeaking = false
    room.emit(RoomEvent.TrackUnmuted, mic, amina)
    expect(lastOf(l.onParticipants).find((p: { id: string }) => p.id === 'amina')).toMatchObject({ speaking: false, mic: true })
  })
})

describe('videos received (#278)', () => {
  const camera = (room: FakeRoom, id: string) => {
    const person = room.addRemote(id)
    const pub = new FakePublication('camera', new FakeTrack('video'))
    person.trackPublications.set('camera', pub)
    room.emit(RoomEvent.TrackSubscribed, pub.track, pub, person)
    return pub
  }

  it('caps every camera at the 360p layer on a phone-sized screen, and lifts the cap when the screen grows', async () => {
    const screen = screenOf(true)
    const { room } = await connected(true, screen)
    const amina = camera(room, 'amina')
    expect(amina.quality).toBe(VideoQuality.MEDIUM)
    // Turned on its side, a large tablet or a window made wider: the tiles may be large, so the cap goes.
    screen.set(false)
    expect(amina.quality).toBe(VideoQuality.HIGH)
    const theo = camera(room, 'theo')
    expect(theo.quality).toBeUndefined()
    screen.set(true)
    expect([amina.quality, theo.quality]).toEqual([VideoQuality.MEDIUM, VideoQuality.MEDIUM])
  })

  it('leaves a computer screen to adaptive stream alone, and an audio track is never capped', async () => {
    const { room } = await connected(false, screenOf(false))
    const amina = camera(room, 'amina')
    const voice = new FakePublication('microphone', new FakeTrack('audio'))
    room.emit(RoomEvent.TrackSubscribed, voice.track, voice, room.remoteParticipants.get('amina'))
    expect(amina.quality).toBeUndefined()
    expect(voice.quality).toBeUndefined()
  })

  it('stops watching the screen when the call ends', async () => {
    const screen = screenOf(true)
    const { engine } = await connected(true, screen)
    expect(screen.watched).toBe(1)
    await engine.leave()
    expect(screen.watched).toBe(0)
  })
})

describe('devices', () => {
  it('asks for one device at a time', async () => {
    const { engine, local } = await connected()
    let micAtCamera: boolean | null = null
    const camera = local.setCameraEnabled.bind(local)
    local.setCameraEnabled = (on: boolean) => {
      micAtCamera = local.isMicrophoneEnabled
      return camera(on)
    }
    await Promise.all([engine.setMic(true), engine.setCamera(true)])
    expect(local.requests).toEqual([['microphone', true], ['camera', true]])
    expect(micAtCamera).toBe(true)
  })

  it('maps device errors and keeps the call', async () => {
    const { l, engine, room } = await connected()
    deviceFailures.set('microphone', domError('NotAllowedError'))
    expect(await engine.setMic(true)).toBe(false)
    expect(l.onDeviceProblem).toHaveBeenLastCalledWith('audio', 'denied')
    deviceFailures.set('camera', domError('NotReadableError'))
    expect(await engine.setCamera(true)).toBe(false)
    expect(l.onDeviceProblem).toHaveBeenLastCalledWith('video', 'busy')
    room.emit(RoomEvent.MediaDevicesError, domError('NotFoundError'), 'videoinput')
    expect(l.onDeviceProblem).toHaveBeenLastCalledWith('video', 'no-device')
    expect(l.onEnded).not.toHaveBeenCalled()
  })

  it('follows a revoked microphone and never switches it back on', async () => {
    const { l, engine, room, local } = await connected()
    await engine.setMic(true)
    room.setPermissions([1])
    await vi.waitFor(() => expect(lastOf(l.onDevices)).toEqual({ mic: false, camera: false }))
    expect(lastOf(l.onRights)).toEqual({ canSpeak: false, canVideo: true })
    room.setPermissions([1, 2])
    expect(lastOf(l.onRights)).toEqual({ canSpeak: true, canVideo: true })
    await Promise.resolve()
    expect(local.requests.filter(([, on]) => on)).toEqual([['microphone', true]])
    expect(local.isMicrophoneEnabled).toBe(false)
  })

  it('keeps a camera ended on a hidden page off when the page comes back (US2 #6)', async () => {
    const { l, engine, local } = await connected()
    await engine.setCamera(true)
    setVisibility('hidden')
    local.getTrackPublication('camera')!.track!.emit('ended')
    await vi.waitFor(() => expect(lastOf(l.onDevices)).toEqual({ mic: false, camera: false }))
    setVisibility('visible')
    await Promise.resolve()
    expect(local.isCameraEnabled).toBe(false)
    expect(local.requests).toEqual([['camera', true], ['camera', false]])
  })

  it('switches the camera off on a phone when the page is hidden, and leaves it off', async () => {
    const { l, engine, local } = await connected(true)
    await engine.setCamera(true)
    setVisibility('hidden')
    await vi.waitFor(() => expect(lastOf(l.onDevices)).toEqual({ mic: false, camera: false }))
    setVisibility('visible')
    expect(local.isCameraEnabled).toBe(false)
  })

  it('leaves a computer camera on in a background tab', async () => {
    const { engine, local } = await connected(false)
    await engine.setCamera(true)
    setVisibility('hidden')
    await Promise.resolve()
    expect(local.isCameraEnabled).toBe(true)
  })
})

describe('connection', () => {
  it('reports reconnecting and back', async () => {
    const { l, room } = await connected()
    room.emit(RoomEvent.Reconnecting)
    expect(l.onConnection).toHaveBeenLastCalledWith('reconnecting')
    room.emit(RoomEvent.Reconnected)
    expect(l.onConnection).toHaveBeenLastCalledWith('connected')
  })

  it.each([
    [DisconnectReason.PARTICIPANT_REMOVED, 'removed'],
    [DisconnectReason.ROOM_DELETED, 'ended'],
    [DisconnectReason.DUPLICATE_IDENTITY, 'elsewhere'],
    [DisconnectReason.SIGNAL_CLOSE, 'lost'],
    [undefined, 'lost'],
  ])('maps a server disconnect %s to %s', async (reason, end) => {
    const { l, room } = await connected()
    room.emit(RoomEvent.Disconnected, reason)
    expect(l.onEnded).toHaveBeenCalledWith(end)
  })

  it('leave stops every track and the sound, and reports no end', async () => {
    const { l, engine, room, local } = await connected()
    await engine.setMic(true)
    await engine.setCamera(true)
    room.emit(RoomEvent.TrackSubscribed, new FakeTrack('audio'), {}, room.addRemote('amina'))
    const tracks = [...local.trackPublications.values()].map((p) => p.track!)
    await engine.leave()
    expect(room.disconnected).toBe(true)
    expect(tracks.every((t) => t.stopped)).toBe(true)
    expect(document.querySelector('[data-call="audio"]')).toBeNull()
    expect(l.onEnded).not.toHaveBeenCalled()
    expect(await engine.setMic(true)).toBe(false)
  })
})
