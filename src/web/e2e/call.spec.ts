import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, signIn } from './helpers'

// Spec 009 T925: the call on every screen against the local LiveKit of the AppHost. Chromium's fake devices (a test
// pattern and a beep) stand in for the camera and the microphone (quickstart A). Project "en" is a laptop, project "ar"
// a Pixel 7 in Arabic. E2E_CALL_PEERS sets how many pages fill the paging test (12 by default).

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
const VOICE = join(tmpdir(), 'circloo-e2e-voice.wav')
writeFileSync(VOICE, voiceWav())

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${VOICE}`] },
  permissions: ['camera', 'microphone'],
})

const PEERS = Number(process.env.E2E_CALL_PEERS ?? 12)
const GUESTS = [
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
function trackPeerConnections() {
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

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

/** Pirikoo's suggestions float over the bottom corner; this test is about the call, so they are turned off when they show. */
async function quietPirikoo(page: Page) {
  await page.addLocatorHandler(page.locator('.pkl__tip:not([hidden])'), async () => {
    await page.locator('.pkl__off').click()
  })
}

/** CSP violations reported by any page of the test. */
function watchCsp(page: Page, into: string[]) {
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to (connect|load|execute|apply)/i.test(m.text())) into.push(m.text())
  })
}

async function createCircle(page: Page, locale: 'en' | 'ar') {
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

async function guest(browser: Browser, code: string, i: number, locale: 'en' | 'ar', phone: boolean, csp: string[]) {
  const g = GUESTS[i % GUESTS.length]!
  const ctx = await browser.newContext({
    locale: locale === 'ar' ? 'ar-MA' : 'en-GB',
    permissions: ['camera', 'microphone'],
    ...(phone ? { viewport: { width: 412, height: 839 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } }),
  })
  await ctx.addInitScript(trackPeerConnections)
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
async function openCallTab(page: Page) {
  const side = page.locator('[data-slot="room-side"]')
  const rail = side.locator('.room-side__rail-btn[data-tab="call"]')
  const pill = side.locator('.room-side__handle:not(.room-side__rail-btn)')
  if (await rail.isVisible()) await rail.click()
  else if (await pill.isVisible()) await pill.click()
  await side.locator('.room-side__tab[aria-controls$="-panel-call"]').click()
  return side
}

/** Taps Join call and returns how long until the first audio packets arrive (SC-903). */
async function joinAndHear(page: Page) {
  const side = await openCallTab(page)
  const started = Date.now()
  await side.locator('.call__join').click()
  await expect.poll(() => audioPackets(page), { timeout: 10_000, intervals: [50] }).toBeGreaterThan(0)
  return Date.now() - started
}

function audioPackets(page: Page) {
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
async function decodedVideos(page: Page) {
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

test.describe('call', () => {
  test('call: join and hear, speaking, characters for cameras off, leave, the audience screen (spec 009 US2)', async ({ page, browser }, info) => {
    test.setTimeout(240_000)
    const locale = localeOf(info)
    const ar = locale === 'ar'
    const phone = (page.viewportSize()?.width ?? 1280) < 960
    const csp: string[] = []
    watchCsp(page, csp)
    await quietPirikoo(page)
    await page.context().addInitScript(trackPeerConnections)
    await signIn(page, locale, 'e2e-call')
    const circle = await createCircle(page, locale)
    const guests = []
    for (let i = 0; i < 3; i++) guests.push(await guest(browser, circle.code, i, locale, phone, csp))

    await page.goto(`/app/circles/${circle.id}`)
    await expect(page.locator('.people__row.is-online')).toHaveCount(4)

    // Calls are off: a guest sees no call control at all.
    const amina = guests[0]!
    const aminaSide = await openCallTab(amina.page)
    await expect(aminaSide.locator('.call__state')).toHaveText(ar ? 'لا توجد مكالمة الآن.' : 'No call right now.')
    await expect(aminaSide.locator('.call__join')).toHaveCount(0)

    // The animator starts a video call (the switch of T906 until T926), joins and switches the microphone on.
    const side = await openCallTab(page)
    await side.getByRole('switch').click()
    await expect(side.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await side.locator('.call__join').click()
    await expect(page.locator('.call-bar__device')).toHaveCount(2)
    const mic = page.locator('.call-bar__device').first()
    await mic.click()
    await expect(mic).toHaveAttribute('aria-pressed', 'true')

    // Three guests join: each hears the animator within 2 s at the median, 4 s at worst (SC-903).
    await expect(aminaSide.locator('.call__state')).toHaveText(ar ? 'مكالمة فيديو جارية.' : 'A video call is on.')
    const times = []
    for (const g of guests) times.push(await joinAndHear(g.page))
    times.sort((a, b) => a - b)
    console.log(`join to first audio (ms): ${times.join(', ')}`)
    expect(times[1]).toBeLessThanOrEqual(2000)
    expect(times[2]).toBeLessThanOrEqual(4000)

    // The animator's beep: her tile is outlined and says "Speaking" on every guest's screen.
    for (const g of guests) {
      const tile = g.page.locator(`.call-tile[data-member="${circle.me}"]`)
      await expect(tile).toHaveClass(/is-speaking/, { timeout: 10_000 })
      await expect(tile.locator('.call-tile__speaking')).toHaveText(ar ? 'يتحدث' : 'Speaking')
    }

    // Cameras off: characters and names, never an empty box; a camera switched on shows its video.
    await expect(page.locator('.call-stage .call-tile')).toHaveCount(4)
    await expect(page.locator('.call-stage video')).toHaveCount(0)
    await expect(page.locator('.call-stage .call-tile__char')).toHaveCount(4)
    await expect(page.locator(`.call-tile[data-member="${amina.id}"] .call-tile__name`)).toContainText(amina.name)
    await amina.page.locator('.call-bar__device').nth(1).click()
    await expect(page.locator(`.call-tile[data-member="${amina.id}"] video`)).toBeVisible({ timeout: 10_000 })

    await axe(page)
    await axe(amina.page)

    // Leave: Théo's call ends at once and the others see three tiles.
    const theo = guests[1]!
    await theo.page.locator('.call-bar__leave').click()
    await expect(theo.page.locator('.call-bar')).toHaveCount(0)
    await expect(theo.page.locator('.call-stage')).toHaveCount(0)
    expect(await theo.page.evaluate(() => (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs.every((pc) => pc.connectionState === 'closed'))).toBe(true)
    await expect(page.locator('.call-stage .call-tile')).toHaveCount(3, { timeout: 10_000 })

    // The audience screen (projector) asks for no pass, plays nothing and names nobody (FR-934).
    const passes: string[] = []
    const audience = await page.context().newPage()
    watchCsp(audience, csp)
    audience.on('request', (r) => {
      if (r.url().includes('/call/token')) passes.push(r.url())
    })
    await audience.goto(`/app/circles/${circle.id}/audience`)
    await audience.waitForLoadState('networkidle')
    await audience.waitForTimeout(1500)
    expect(passes).toEqual([])
    await expect(audience.locator('audio, video')).toHaveCount(0)
    expect(await audience.evaluate(() => (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs.length)).toBe(0)
    const shown = await audience.locator('body').innerText()
    for (const g of guests) expect(shown).not.toContain(g.name)

    expect(csp).toEqual([])
    for (const g of guests) await g.page.context().close()
  })

  test('call: pages of 9 tiles on a computer and 4 on a phone, decoding only what shows (SC-912)', async ({ page, browser }, info) => {
    test.setTimeout(480_000)
    const locale = localeOf(info)
    const phone = (page.viewportSize()?.width ?? 1280) < 960
    const csp: string[] = []
    watchCsp(page, csp)
    await quietPirikoo(page)
    await page.context().addInitScript(trackPeerConnections)
    await signIn(page, locale, 'e2e-call-pages')
    const circle = await createCircle(page, locale)
    await page.goto(`/app/circles/${circle.id}`)
    const side = await openCallTab(page)
    await side.getByRole('switch').click()
    await expect(side.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await side.locator('.call__join').click()
    await expect(page.locator('.call-bar__device')).toHaveCount(2)

    // Everyone else joins with the camera on (desktop-sized guests; only the animator's screen is measured).
    const guests = []
    for (let i = 0; i < PEERS - 1; i++) {
      const g = await guest(browser, circle.code, i, locale, false, csp)
      await (await openCallTab(g.page)).locator('.call__join').click()
      const camera = g.page.locator('.call-bar__device').nth(1)
      await camera.click()
      await expect(camera).toHaveAttribute('aria-pressed', 'true')
      guests.push(g)
    }

    const size = phone ? 4 : 9
    const tiles = page.locator('.call-stage .call-tile')
    await expect(tiles).toHaveCount(Math.min(size, PEERS), { timeout: 20_000 })
    if (PEERS > size) await expect(page.locator('.call-stage__pages')).toBeVisible()
    // Every remote camera on the page shows; nothing more is decoded than the tiles shown plus one (SC-912).
    const shownVideos = Math.min(size, PEERS) - 1
    await expect(page.locator('.call-stage video')).toHaveCount(shownVideos, { timeout: 20_000 })
    const decoded = await decodedVideos(page)
    console.log(`${phone ? 'phone' : 'computer'}: ${await tiles.count()} tiles, ${decoded} videos decoded`)
    expect(decoded).toBeLessThanOrEqual(shownVideos + 1)

    // The next page by keyboard: the other people, still within the limits.
    if (PEERS > size) {
      await page.locator('.call-stage__page-btn').last().focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.call-stage__page')).toContainText('2')
      expect(await tiles.count()).toBeLessThanOrEqual(size)
      expect(await decodedVideos(page)).toBeLessThanOrEqual(size)
    }
    await axe(page)

    // Leave: the camera light goes off and nothing is received any more.
    await page.locator('.call-bar__leave').click()
    await expect(page.locator('.call-stage')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs.every((pc) => pc.connectionState === 'closed'))).toBe(true)
    expect(csp).toEqual([])
    for (const g of guests) await g.page.context().close()
  })
})
