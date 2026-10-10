import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test as base, type Browser, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import postgres from 'postgres'

// Shared by the call e2e (spec 009): fake devices, guests, the Call tab, what a page receives (getStats), timings taken
// inside the pages, crafted hub calls, and the database snapshot of SC-906.

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

/** Chromium's fake camera (a test pattern) and microphone (VOICE), with no permission prompt (quickstart A). */
export const FAKE_MEDIA = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${VOICE}`]

/** The same browser with UDP blocked: media can only come over ICE/TCP (research R28, SC-916). */
export const UDP_BLOCKED = [...FAKE_MEDIA, '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']

/** How many pages the measurements fill, the animator's included (E2E_CALL_PEERS, at least 4). */
export const CALL_PEERS = Math.max(4, Number(process.env.E2E_CALL_PEERS ?? 4))

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

/** What has the focus in the page, as `tag.class`, or 'body'. */
export function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return el && el !== document.body ? `${el.tagName.toLowerCase()}.${el.className}` : 'body'
  })
}

/**
 * The keyboard of one person in the room (T914): `tabTo` presses Tab (or Shift+Tab) until the target has the focus and
 * checks a visible focus ring at every stop on the way; `toTab` reaches one of the side's tabs from the keyboard (the
 * phone's pill opens the sheet first) and moves with the arrows in reading order, mirrored in Arabic.
 */
export function keys(page: Page, ar: boolean) {
  const side = page.locator('[data-slot="room-side"]')
  const tab = (id: string) => side.locator(`.room-side__tab[aria-controls$="-panel-${id}"]`)
  const tabTo = async (target: Locator, back = false, max = 70) => {
    for (let i = 0; i < max; i++) {
      if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return
      await page.keyboard.press(back ? 'Shift+Tab' : 'Tab')
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body || el.closest('.canvas, .pkl, .topbar, .guest-bar, header')) return 'skip'
        const s = getComputedStyle(el)
        const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
        return outline || s.boxShadow !== 'none' ? 'ok' : `${el.tagName}.${el.className}`
      })
      if (ring !== 'ok' && ring !== 'skip') throw new Error(`No visible focus on ${ring}`)
    }
    throw new Error(`Never reached ${target} (focus on ${await focused(page)})`)
  }
  const next = ar ? 'ArrowLeft' : 'ArrowRight'
  const prev = ar ? 'ArrowRight' : 'ArrowLeft'
  const toTab = async (id: string) => {
    const pill = side.locator('.room-side__handle:not(.room-side__rail-btn)')
    if (await pill.isVisible()) {
      await tabTo(pill)
      await page.keyboard.press('Enter')
    } else {
      await tabTo(side.locator('.room-side__tab[aria-selected="true"]'))
    }
    const ids = ['people', 'chat', 'hands', 'call']
    for (let i = 0; i < 6 && (await tab(id).getAttribute('aria-selected')) !== 'true'; i++) {
      const at = ids.indexOf((await page.evaluate(() => document.activeElement?.getAttribute('aria-controls') ?? '')).replace(/.*-panel-/, ''))
      await page.keyboard.press(at < ids.indexOf(id) ? next : prev)
    }
    await expect(tab(id)).toBeFocused()
    // The open tab is in view in the strip that scrolls sideways on a phone.
    const strip = (await side.locator('[role="tablist"]').boundingBox())!
    const box = (await tab(id).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(strip.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(strip.x + strip.width + 1)
  }
  return { side, tab, tabTo, toTab }
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

/**
 * Taps Join call and returns how long until the first audio packet arrives (SC-903, research R32). Both moments are
 * taken inside the page: the tap by a capture listener, the packet by reading getStats() every 20 ms from then on, so
 * Playwright's own round trips are not counted.
 */
export async function joinAndHear(page: Page, timeout = 10_000) {
  const side = await openCallTab(page)
  await page.evaluate(() => {
    const w = window as unknown as { __pcs: RTCPeerConnection[]; __heardAfter?: number }
    delete w.__heardAfter
    const onTap = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.('.call__join')) return
      document.removeEventListener('click', onTap, true)
      const tapped = performance.now()
      const tick = async () => {
        let packets = 0
        for (const pc of w.__pcs) {
          if (pc.connectionState === 'closed') continue
          ;(await pc.getStats()).forEach((s: { type: string; kind?: string; packetsReceived?: number }) => {
            if (s.type === 'inbound-rtp' && s.kind === 'audio') packets += s.packetsReceived ?? 0
          })
        }
        if (packets > 0) w.__heardAfter = Math.round(performance.now() - tapped)
        else if (performance.now() - tapped < 30_000) setTimeout(() => void tick(), 20)
      }
      void tick()
    }
    document.addEventListener('click', onTap, true)
  })
  await side.locator('.call__join').click()
  const heard = await page.waitForFunction(() => (window as unknown as { __heardAfter?: number }).__heardAfter, null, { timeout, polling: 50 })
  return (await heard.jsonValue()) as number
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

/** Whether audio keeps arriving: the inbound audio packets grow within `ms`. */
export async function receivingAudio(page: Page, ms = 1000) {
  const before = await audioPackets(page)
  await page.waitForTimeout(ms)
  return (await audioPackets(page)) > before
}

/** The share of received audio the browser had to conceal (lost or late), from 0 to 1 (research R32, SC-914). */
export function concealedAudio(page: Page) {
  return page.evaluate(async () => {
    let concealed = 0
    let total = 0
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      if (pc.connectionState === 'closed') continue
      ;(await pc.getStats()).forEach((s: { type: string; kind?: string; concealedSamples?: number; totalSamplesReceived?: number }) => {
        if (s.type !== 'inbound-rtp' || s.kind !== 'audio') return
        concealed += s.concealedSamples ?? 0
        total += s.totalSamplesReceived ?? 0
      })
    }
    return total ? concealed / total : 0
  })
}

/**
 * What this page decodes: the inbound videos whose decoded frames grow over 3 s, and the tallest frame among them
 * (research R32, SC-912).
 */
export async function decoding(page: Page) {
  const frames = () =>
    page.evaluate(async () => {
      const out: Record<string, { frames: number; height: number }> = {}
      const pcs = (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs
      for (const [i, pc] of pcs.entries()) {
        if (pc.connectionState === 'closed') continue
        ;(await pc.getStats()).forEach((s: { type: string; kind?: string; id: string; framesDecoded?: number; frameHeight?: number }) => {
          if (s.type === 'inbound-rtp' && s.kind === 'video') out[`${i}:${s.id}`] = { frames: s.framesDecoded ?? 0, height: s.frameHeight ?? 0 }
        })
      }
      return out
    })
  const before = await frames()
  await page.waitForTimeout(3000)
  const growing = Object.entries(await frames()).filter(([id, v]) => v.frames > (before[id]?.frames ?? 0))
  return { videos: growing.length, tallest: Math.max(0, ...growing.map(([, v]) => v.height)) }
}

/** How many videos this page decodes (see `decoding`). */
export async function decodedVideos(page: Page) {
  return (await decoding(page)).videos
}

/** Nearest-rank percentile of a list of numbers (0 < p <= 100). */
export function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!
}

let watches = 0

/**
 * How long after a tap something shows on each page (SC-913). Each watch arms a MutationObserver in its page that
 * stamps the wall clock the moment `selector` starts to match (or stops, with `present: false`); the tap is stamped by
 * a capture listener in the tapping page. The pages share this machine's clock, so the differences are the delays.
 * A watch whose condition already holds before the tap fails, so a delay is never reported as 0 by mistake.
 */
export async function effectTimes(tapper: Page, tap: () => Promise<void>, watch: { page: Page; selector: string; present?: boolean }[]) {
  const key = `w${++watches}`
  await tapper.evaluate(() => {
    const w = window as unknown as { __tapStamp?: boolean; __tappedAt?: number }
    delete w.__tappedAt
    if (w.__tapStamp) return
    w.__tapStamp = true
    document.addEventListener('click', () => (w.__tappedAt = Date.now()), true)
  })
  await Promise.all(watch.map((w, i) =>
    w.page.evaluate(({ key, selector, present }) => {
      const stamps = ((window as unknown as { __stamps?: Record<string, number | null> }).__stamps ??= {})
      const met = () => (document.querySelector(selector) !== null) === present
      if (met()) throw new Error(`${selector} is already ${present ? 'there' : 'gone'}`)
      stamps[key] = null
      const observer = new MutationObserver(() => {
        if (!met()) return
        stamps[key] = Date.now()
        observer.disconnect()
      })
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
    }, { key: `${key}-${i}`, selector: w.selector, present: w.present ?? true })))
  await tap()
  const tapped = await tapper.evaluate(() => (window as unknown as { __tappedAt?: number }).__tappedAt)
  if (!tapped) throw new Error('the tap was not seen')
  return Promise.all(watch.map(async (w, i) => {
    const at = await w.page
      .waitForFunction((k) => (window as unknown as { __stamps: Record<string, number | null> }).__stamps[k], `${key}-${i}`, { timeout: 15_000 })
      .catch((e: Error) => {
        throw new Error(`watch ${i + 1} (${w.selector} ${w.present === false ? 'gone' : 'there'}): ${e.message}`)
      })
    return ((await at.jsonValue()) as number) - tapped
  }))
}

/** Every row of every table of the e2e database as JSON text (SC-906). */
export type Snapshot = Map<string, Set<string>>

/** A snapshot of the e2e database, or null when E2E_DATABASE_URL is not set. The xUnit twin is `TableSnapshot`. */
export async function dbSnapshot(): Promise<Snapshot | null> {
  const url = process.env.E2E_DATABASE_URL
  if (!url) return null
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const tables = await sql<{ name: string }[]>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__EFMigrationsHistory' ORDER BY 1`
    const out: Snapshot = new Map()
    for (const { name } of tables) {
      const rows = await sql.unsafe<{ row: string }[]>(`SELECT row_to_json(t)::text AS row FROM "${name.replaceAll('"', '""')}" t`)
      out.set(name, new Set(rows.map((r) => r.row)))
    }
    return out
  } finally {
    await sql.end()
  }
}

/**
 * What one circle left in the e2e database (SC-906 for one circle, safe beside other tests): its chat messages and the
 * types of the audit rows about it. Null when E2E_DATABASE_URL is not set.
 */
export async function circleRows(circleId: string) {
  const url = process.env.E2E_DATABASE_URL
  if (!url) return null
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const messages = await sql<{ kind: string; text: string; reply: boolean }[]>`
      SELECT "Kind" AS kind, "Text" AS text, "ReplyToId" IS NOT NULL AS reply FROM "CircleMessages" WHERE "CircleId" = ${circleId} ORDER BY "Id"`
    const audits = await sql<{ type: string }[]>`
      SELECT DISTINCT "Type" AS type FROM "AuditEvents" WHERE "Detail"->>'circle' = ${circleId} ORDER BY 1`
    const tables = await sql<{ name: string }[]>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name ~* '(record|transcript|call)' ORDER BY 1`
    return { messages, audits: audits.map((a) => a.type), tables: tables.map((t) => t.name) }
  } finally {
    await sql.end()
  }
}

/** The rows each table gained and lost between two snapshots, only for the tables that differ (a changed row is both). */
export function dbChanges(before: Snapshot, after: Snapshot) {
  const out = new Map<string, { added: Record<string, unknown>[]; removed: Record<string, unknown>[] }>()
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(name) ?? new Set<string>()
    const now = after.get(name) ?? new Set<string>()
    const added = [...now].filter((r) => !was.has(r)).map((r) => JSON.parse(r) as Record<string, unknown>)
    const removed = [...was].filter((r) => !now.has(r)).map((r) => JSON.parse(r) as Record<string, unknown>)
    if (added.length || removed.length) out.set(name, { added, removed })
  }
  return out
}

/** The transport of each live connection of the page: 'udp' or 'tcp', from the selected candidate pair (SC-916). */
export function transportProtocols(page: Page) {
  return page.evaluate(async () => {
    const out = new Set<string>()
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      if (pc.connectionState === 'closed') continue
      const stats = await pc.getStats()
      stats.forEach((s: { type: string; selectedCandidatePairId?: string }) => {
        if (s.type !== 'transport' || !s.selectedCandidatePairId) return
        const pair = stats.get(s.selectedCandidatePairId) as { localCandidateId?: string } | undefined
        const local = pair?.localCandidateId ? (stats.get(pair.localCandidateId) as { protocol?: string } | undefined) : undefined
        if (local?.protocol) out.add(local.protocol)
      })
    }
    return [...out]
  })
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

export type Guest = Awaited<ReturnType<typeof guest>>

/** Opens `count` guests in a circle (see `test`). */
export type Peers = { open(code: string, count: number, o: { locale: 'en' | 'ar'; phone: boolean; csp: string[]; first?: number }): Promise<Guest[]> }

/**
 * The multi-page fixture of the call measurements: `peers.open` fills a circle with guests (each its own browser
 * context, so its own cookies and media), all closed after the test even when it fails.
 */
export const test = base.extend<{ peers: Peers }>({
  peers: async ({ browser }, provide) => {
    const opened: Guest[] = []
    await provide({
      async open(code, count, { locale, phone, csp, first = 0 }) {
        const out: Guest[] = []
        for (let i = first; i < first + count; i++) {
          const g = await guest(browser, code, i, locale, phone, csp)
          opened.push(g)
          out.push(g)
        }
        return out
      },
    })
    for (const g of opened) await g.page.context().close().catch(() => {})
  },
})
