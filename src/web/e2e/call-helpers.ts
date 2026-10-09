import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Shared by the call e2e (spec 009): fake devices, guests, the Call tab, what a page receives, and crafted hub calls.

/**
 * A voice the call server recognises as speech. Chromium's own fake microphone only beeps briefly once a second, which the
 * call server's speaker detection rightly ignores; this loops 2 s of a voiced, gliding, syllable-shaped sound instead.
 */
function voiceWav(): Buffer {
  const rate = 16000
  const n = rate * 2
  const data = Buffer.alloc(n * 2)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const time = i / rate
    phase += (2 * Math.PI * (150 + 50 * Math.sin(2 * Math.PI * 0.7 * time))) / rate
    const syllables = 0.65 + 0.35 * Math.sin(2 * Math.PI * 4 * time)
    const voiced = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, 0.45 * syllables * voiced)) * 32767), i * 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}
export const VOICE = join(tmpdir(), 'circloo-e2e-voice.wav')
writeFileSync(VOICE, voiceWav())

export const GUESTS = [
  { en: 'Amina', ar: 'أمينة', character: 'fox' },
  { en: 'Théo', ar: 'تيو', character: 'owl' },
  { en: 'Lucía', ar: 'لوسيا', character: 'cat' },
  { en: 'Youssef', ar: 'يوسف', character: 'frog' },
  { en: 'Inès', ar: 'إيناس', character: 'bear' },
  { en: 'Malik', ar: 'مالك', character: 'bunny' },
  { en: 'Sofía', ar: 'صوفيا', character: 'bee' },
  { en: 'Hugo', ar: 'هوغو', character: 'lion' },
  { en: 'Leïla', ar: 'ليلى', character: 'koala' },
  { en: 'Omar', ar: 'عمر', character: 'whale' },
  { en: 'Camille', ar: 'كاميل', character: 'dino' },
  { en: 'Kenji', ar: 'كنجي', character: 'chick' },
]

/** Keeps every peer connection of the page, so the test can read what it receives (getStats), as the app never exposes it. */
export function trackPeerConnections() {
  const Native = window.RTCPeerConnection
  const all: RTCPeerConnection[] = []
  Object.assign(window, { __pcs: all })
  window.RTCPeerConnection = class extends Native {
    constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
      super(...args)
      all.push(this)
    }
  }
}

/**
 * Devices the test scripts (spec 009 T907): each kind fails with the error name set in `window.__gum`, or goes to
 * Chromium's fake device with 'ok'. `window.__gumCalls` counts what the page asked for, so a test can see that nothing
 * was asked before the person pressed a device button and the primer's Continue.
 */
export function scriptedDevices() {
  const devices = navigator.mediaDevices
  if (!devices?.getUserMedia) return
  const real = devices.getUserMedia.bind(devices)
  const w = window as unknown as { __gum: Record<'audio' | 'video', string>; __gumCalls: number }
  w.__gum = { audio: 'ok', video: 'ok' }
  w.__gumCalls = 0
  devices.getUserMedia = async (c?: MediaStreamConstraints) => {
    w.__gumCalls++
    for (const kind of ['audio', 'video'] as const) {
      if (c?.[kind] && w.__gum[kind] !== 'ok') throw new DOMException('scripted', w.__gum[kind])
    }
    return real(c)
  }
}

/** A browser that will still ask for the camera and the microphone (the context grants them, so it would not). */
export function devicesNotYetAllowed() {
  const query = navigator.permissions.query.bind(navigator.permissions)
  navigator.permissions.query = (d: PermissionDescriptor) =>
    d.name === ('camera' as PermissionName) || d.name === ('microphone' as PermissionName)
      ? Promise.resolve(Object.assign(new EventTarget(), { name: d.name, state: 'prompt', onchange: null }) as unknown as PermissionStatus)
      : query(d)
}

/** A browser without live audio or video. */
export function noWebRtc() {
  Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, writable: true, value: undefined })
}

export async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

/** Pirikoo's suggestions float over the bottom corner; this test is about the call, so they are turned off when they show. */
export async function quietPirikoo(page: Page) {
  await page.addLocatorHandler(page.locator('.pkl__tip:not([hidden])'), async () => {
    await page.locator('.pkl__off').click()
  })
}

/** CSP violations reported by any page of the test. */
export function watchCsp(page: Page, into: string[]) {
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to (connect|load|execute|apply)/i.test(m.text())) into.push(m.text())
  })
}

export async function createCircle(page: Page, locale: 'en' | 'ar') {
  return page.evaluate(async (lng) => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))!.slice('XSRF-TOKEN='.length))
    const res = await fetch('/api/circles', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ name: lng === 'ar' ? 'اجتماع الفريق' : 'Team call', activities: ['canvas', 'quick-question'], character: 'panda', locale: lng }),
    })
    const body = (await res.json()) as { id: string; joinCode: string }
    const view = (await (await fetch(`/api/circles/${body.id}`, { credentials: 'same-origin' })).json()) as { me: { id: string } }
    return { id: body.id, code: body.joinCode, me: view.me.id }
  }, locale)
}

export async function guest(
  browser: Browser, code: string, i: number, locale: 'en' | 'ar', phone: boolean, csp: string[],
  options: { bypassCSP?: boolean; init?: (() => void)[] } = {},
) {
  const g = GUESTS[i % GUESTS.length]!
  const ctx = await browser.newContext({
    locale: locale === 'ar' ? 'ar-MA' : 'en-GB',
    permissions: ['camera', 'microphone'],
    // Only for the modified client of the controls test, which loads livekit-client from outside the app.
    ...(options.bypassCSP ? { bypassCSP: true } : {}),
    ...(phone ? { viewport: { width: 412, height: 839 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } }),
  })
  await ctx.addInitScript(trackPeerConnections)
  for (const script of options.init ?? []) await ctx.addInitScript(script)
  const page = await ctx.newPage()
  watchCsp(page, csp)
  await quietPirikoo(page)
  await page.goto(`/join/${code}`)
  await page.locator('input[name=name]').fill(`${locale === 'ar' ? g.ar : g.en}${i >= GUESTS.length ? ` ${i}` : ''}`)
  await page.locator(`.pick__item:has(input[value=${g.character}])`).click()
  // The ring picker shows when the character is already used.
  const ring = page.locator('.rings__item.is-picked')
  if (await ring.count()) await ring.click()
  await page.locator('form button[type=submit]').click()
  // Many pages with cameras on load this machine: the join gets more time than the default.
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]+$/, { timeout: 20_000 })
  const id = await page.evaluate(async () => {
    const circle = location.pathname.split('/').pop()
    return ((await (await fetch(`/api/circles/${circle}`, { credentials: 'same-origin' })).json()) as { me: { id: string } }).me.id
  })
  return { page, id, name: locale === 'ar' ? g.ar : g.en }
}

/** Opens the Call tab, from the rail, the phone's pill or the open sidebar. */
export async function openCallTab(page: Page) {
  const side = page.locator('[data-slot="room-side"]')
  const rail = side.locator('.room-side__rail-btn[data-tab="call"]')
  const pill = side.locator('.room-side__handle:not(.room-side__rail-btn)')
  const tab = side.locator('.room-side__tab[aria-controls$="-panel-call"]')
  // A phone's sheet may open and close by itself while a round starts: try again until the tab is there.
  await expect(async () => {
    if (await rail.isVisible()) await rail.click()
    else if (await pill.isVisible()) await pill.click()
    await tab.click({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  return side
}

/** Taps Join call and returns how long until the first audio packets arrive (SC-903). */
export async function joinAndHear(page: Page) {
  const side = await openCallTab(page)
  const started = Date.now()
  await side.locator('.call__join').click()
  await expect.poll(() => audioPackets(page), { timeout: 10_000, intervals: [50] }).toBeGreaterThan(0)
  return Date.now() - started
}

export function audioPackets(page: Page) {
  return page.evaluate(async () => {
    let n = 0
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      if (pc.connectionState === 'closed') continue
      ;(await pc.getStats()).forEach((s: { type: string; kind?: string; packetsReceived?: number }) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio') n += s.packetsReceived ?? 0
      })
    }
    return n
  })
}

/** How many videos this page decodes: inbound video whose decoded frames grow over 3 s (research R32). */
export async function decodedVideos(page: Page) {
  const frames = () =>
    page.evaluate(async () => {
      const out: Record<string, number> = {}
      const pcs = (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs
      for (const [i, pc] of pcs.entries()) {
        if (pc.connectionState === 'closed') continue
        ;(await pc.getStats()).forEach((s: { type: string; kind?: string; id: string; framesDecoded?: number }) => {
          if (s.type === 'inbound-rtp' && s.kind === 'video') out[`${i}:${s.id}`] = s.framesDecoded ?? 0
        })
      }
      return out
    })
  const before = await frames()
  await page.waitForTimeout(3000)
  const after = await frames()
  return Object.entries(after).filter(([id, n]) => n > (before[id] ?? 0)).length
}

/**
 * A crafted hub call, as a modified client would send it: a second SignalR connection from the page (with its cookies),
 * speaking the JSON protocol by hand. It enters the circle, invokes `method` and resolves with the hub's error text, or
 * null when the call was accepted. With `keep`, the connection stays open (a raised hand stays raised) until
 * `closeHubCalls`.
 */
export function hubCall(page: Page, circleId: string, method: string, args: unknown[] = [], keep = false): Promise<string | null> {
  return page.evaluate(async ({ circleId, method, args, keep }) => {
    const RS = '\u001e'
    const negotiate = await fetch('/hubs/circle/negotiate?negotiateVersion=1', { method: 'POST', credentials: 'same-origin' })
    const { connectionToken } = (await negotiate.json()) as { connectionToken: string }
    const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/hubs/circle?id=${encodeURIComponent(connectionToken)}`)
    const pending = new Map<string, (error: string | null) => void>()
    let handshake: () => void = () => {}
    const shook = new Promise<void>((resolve) => (handshake = resolve))
    ws.onmessage = (e) => {
      for (const frame of String(e.data).split(RS)) {
        if (!frame) continue
        const m = JSON.parse(frame) as { type?: number; invocationId?: string; error?: string }
        if (m.type === undefined) handshake()
        else if (m.type === 3 && m.invocationId) pending.get(m.invocationId)?.(m.error ?? null)
      }
    }
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('hub unreachable'))
    })
    ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RS)
    await shook
    let next = 0
    const invoke = (target: string, a: unknown[]) =>
      new Promise<string | null>((resolve) => {
        const id = String(++next)
        pending.set(id, resolve)
        ws.send(JSON.stringify({ type: 1, invocationId: id, target, arguments: a }) + RS)
      })
    const entered = await invoke('Enter', [circleId])
    const error = entered ?? (await invoke(method, args))
    const w = window as unknown as { __hubCalls?: WebSocket[] }
    if (keep) (w.__hubCalls ??= []).push(ws)
    else ws.close()
    return error
  }, { circleId, method, args, keep })
}

/** Closes the connections `hubCall` kept open. */
export function closeHubCalls(page: Page) {
  return page.evaluate(() => {
    for (const ws of (window as unknown as { __hubCalls?: WebSocket[] }).__hubCalls ?? []) ws.close()
  })
}
