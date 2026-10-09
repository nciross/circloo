import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium, expect, test, type Page } from '@playwright/test'
import { localeOf, signIn } from './helpers'
import {
  VOICE, audioPackets, axe, closeHubCalls, createCircle, decodedVideos, devicesNotYetAllowed, guest, hubCall, joinAndHear, noWebRtc, openCallTab,
  quietPirikoo, scriptedDevices, trackPeerConnections, watchCsp,
} from './call-helpers'

// Spec 009 T925, T926, T907 and T927: the call on every screen, the animator's controls, the devices, and hands and
// reactions, against the local LiveKit of the AppHost. Chromium's fake devices (a test pattern and a voice) stand in for
// the camera and the microphone (quickstart A). Project "en" is a laptop, project "ar" a Pixel 7 in Arabic.
// E2E_CALL_PEERS sets how many pages fill the paging test (12 by default) and how many pages clap together in the
// reactions test (20 by default); lower it on a machine short of memory.

const FAKE_DEVICES = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${VOICE}`]

test.use({
  launchOptions: { args: FAKE_DEVICES },
  permissions: ['camera', 'microphone'],
})

const PEERS = Number(process.env.E2E_CALL_PEERS ?? 12)
const CLAPPERS = Number(process.env.E2E_CALL_PEERS ?? 20)

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

    // The animator starts a video call with the Video call switch, joins and switches the microphone on.
    const side = await openCallTab(page)
    await side.locator('[data-switch="video"]').click()
    await expect(side.locator('[data-switch="video"]')).toHaveAttribute('aria-checked', 'true')
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
    await amina.page.locator('.call-bar__device[data-device="video"]').click()
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
    await side.locator('[data-switch="video"]').click()
    await expect(side.locator('[data-switch="video"]')).toHaveAttribute('aria-checked', 'true')
    await side.locator('.call__join').click()
    await expect(page.locator('.call-bar__device')).toHaveCount(2)

    // Everyone else joins with the camera on (desktop-sized guests; only the animator's screen is measured).
    const guests = []
    for (let i = 0; i < PEERS - 1; i++) {
      const g = await guest(browser, circle.code, i, locale, false, csp)
      await (await openCallTab(g.page)).locator('.call__join').click()
      const camera = g.page.locator('.call-bar__device[data-device="video"]')
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

/** The app's own words in the test's language, so notices are checked as people read them. */
function words(locale: 'en' | 'ar') {
  const all = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')) as {
    circles: {
      call: {
        audioOn: string
        videoOn: string
        mode: Record<string, string>
        notices: Record<string, string>
        errors: Record<string, string>
        device: {
          primer: string
          what: Record<'audio' | 'video', string>
          allow: Record<string, string>
        } & Record<'denied' | 'no-device' | 'busy', Record<'audio' | 'video', string>>
      }
    }
  }
  return all.circles.call
}

const LIVEKIT_UMD = fileURLToPath(new URL('../node_modules/livekit-client/dist/livekit-client.umd.js', import.meta.url))

test.describe('controls', () => {
  test('controls: every switch and action from the animator; a participant has none and is refused (spec 009 US1, US3)', async ({ page, browser }, info) => {
    test.setTimeout(300_000)
    const locale = localeOf(info)
    const w = words(locale)
    const phone = (page.viewportSize()?.width ?? 1280) < 960
    const csp: string[] = []
    watchCsp(page, csp)
    await quietPirikoo(page)
    await signIn(page, locale, 'e2e-controls')
    const circle = await createCircle(page, locale)
    const amina = await guest(browser, circle.code, 0, locale, phone, csp)
    const theo = await guest(browser, circle.code, 1, locale, phone, csp)
    await page.goto(`/app/circles/${circle.id}`)
    await expect(page.locator('.people__row.is-online')).toHaveCount(3)

    // A participant sees no control, and every request they craft is refused.
    const aminaSide = await openCallTab(amina.page)
    await expect(aminaSide.locator('.call__state')).toBeVisible()
    await expect(aminaSide.locator('[data-switch], .call__mode-seg, .person-menu__trigger')).toHaveCount(0)
    expect(await hubCall(amina.page, circle.id, 'EnableDiscussion', [true, 'open'])).toContain('animator-only')
    expect(await hubCall(amina.page, circle.id, 'SetRoomSettings', [{ chat: 'paused', reactions: true, pirikooQuiet: false }])).toContain('animator-only')

    // Chat off: people can no longer write (the server says so); on again.
    const side = await openCallTab(page)
    const chat = side.locator('[data-switch="chat"]')
    const audio = side.locator('[data-switch="audio"]')
    const video = side.locator('[data-switch="video"]')
    await expect(chat).toHaveAttribute('aria-checked', 'true')
    await chat.click()
    await expect(chat).toHaveAttribute('aria-checked', 'false')
    expect(await hubCall(amina.page, circle.id, 'Say', ['Bonjour'])).toContain('chat-paused')
    await chat.click()
    await expect(chat).toHaveAttribute('aria-checked', 'true')

    // Audio call, then video: everyone reads it, and the mode in plain words. Nobody joins by themselves.
    await audio.click()
    await expect(audio).toHaveAttribute('aria-checked', 'true')
    await expect(video).toHaveAttribute('aria-checked', 'false')
    await expect(aminaSide.locator('.call__state')).toHaveText(w.audioOn)
    await expect(aminaSide.locator('.call__mode')).toHaveText(w.mode.handWords!)
    await expect(amina.page.locator('.call-notice__text')).toHaveText(w.notices['call-started']!)
    await video.click()
    await expect(video).toHaveAttribute('aria-checked', 'true')
    await expect(aminaSide.locator('.call__state')).toHaveText(w.videoOn)
    await expect(amina.page.locator('.call-notice__text')).toHaveText(w.notices['video-on']!)
    await expect(amina.page.locator('.call-bar')).toHaveCount(0)
    await axe(page)

    await side.locator('.call__join').click()
    await expect(page.locator('.call-bar__device')).toHaveCount(2)
    // In Hand to speak a participant has the camera, and Raise hand where the microphone would be (T927).
    for (const g of [amina, theo]) {
      await (await openCallTab(g.page)).locator('.call__join').click()
      await expect(g.page.locator('.call-bar__device')).toHaveCount(1)
      await expect(g.page.locator('.call-bar__device[data-device="video"]')).toBeVisible()
      await expect(g.page.locator('.call-bar__hand')).toHaveAttribute('data-hand', 'none')
    }
    const tile = (id: string) => page.locator(`.call-tile[data-member="${id}"]`)
    await expect(tile(amina.id)).toBeVisible()
    await expect(tile(theo.id)).toBeVisible()
    // No menu on the animator's own tile.
    await expect(tile(circle.me).locator('.person-menu__trigger')).toHaveCount(0)
    const menu = page.locator('.person-menu')
    const act = async (trigger: ReturnType<Page['locator']>, action: string) => {
      await trigger.click()
      await menu.locator(`[data-action="${action}"]`).click()
      await expect(menu).toHaveCount(0)
    }
    const onTile = (id: string) => tile(id).locator('.person-menu__trigger')

    // Hand to speak: no microphone without the floor, Raise hand in its place. The floor goes to a raised hand, from
    // the tile's menu, and back.
    const aminaMic = amina.page.locator('.call-bar__device[data-device="audio"]')
    const aminaHand = amina.page.locator('.call-bar__hand')
    await expect(aminaMic).toHaveCount(0)
    expect(await hubCall(amina.page, circle.id, 'RaiseHand', [], true)).toBeNull()
    await expect(aminaHand).toHaveAttribute('data-hand', 'queue')
    await act(onTile(amina.id), 'give')
    await expect(aminaMic).toBeVisible()
    await expect(aminaMic).not.toHaveAttribute('aria-disabled', 'true')
    await expect(aminaHand).toHaveAttribute('data-hand', 'floor')
    await expect(aminaMic).toHaveAttribute('aria-pressed', 'false')
    await expect(amina.page.locator('.call-notice__text')).toHaveText(w.notices['floor-given']!)
    await expect(tile(amina.id).locator('.call-tile__floor')).toBeVisible()
    await aminaMic.click()
    await expect(aminaMic).toHaveAttribute('aria-pressed', 'true')
    await act(onTile(amina.id), 'take')
    await expect(aminaMic).toHaveCount(0)
    await expect(aminaHand).toHaveAttribute('data-hand', 'none')

    // Open mic: anyone may speak; Mute everyone switches microphones off once and locks nothing.
    await openCallTab(page)
    const open = side.locator('.call__mode-seg .seg__opt').nth(1)
    await open.click()
    await expect(open).toHaveAttribute('aria-pressed', 'true')
    await expect(aminaMic).toBeVisible()
    await expect(aminaMic).not.toHaveAttribute('aria-disabled', 'true')
    await expect(amina.page.locator('.call-notice__text')).toHaveText(w.notices['mode-open']!)
    await aminaMic.click()
    await expect(aminaMic).toHaveAttribute('aria-pressed', 'true')
    await side.locator('.call__mute-all').click()
    await expect(aminaMic).toHaveAttribute('aria-pressed', 'false')
    await expect(aminaMic).not.toHaveAttribute('aria-disabled', 'true')
    await expect(amina.page.locator('.call-notice__text')).toHaveText(w.notices['muted-everyone']!)

    // One person's microphone, from the people list this time: off, then allowed again without switching it on.
    await aminaMic.click()
    await expect(aminaMic).toHaveAttribute('aria-pressed', 'true')
    const inList = (id: string) => side.locator(`.call__people [data-member-menu="${id}"]`)
    await openCallTab(page)
    await act(inList(amina.id), 'mute-mic')
    await expect(aminaMic).toHaveAttribute('aria-disabled', 'true')
    await expect(aminaMic).toHaveAttribute('aria-pressed', 'false')
    await expect(amina.page.locator('.call-notice__text')).toHaveText(w.notices['mic-muted']!)
    await openCallTab(page)
    await act(inList(amina.id), 'allow-mic')
    await expect(aminaMic).not.toHaveAttribute('aria-disabled', 'true')
    await expect(aminaMic).toHaveAttribute('aria-pressed', 'false')

    // Her camera, from her tile.
    const aminaCam = amina.page.locator('.call-bar__device[data-device="video"]')
    await aminaCam.click()
    await expect(aminaCam).toHaveAttribute('aria-pressed', 'true')
    await expect(tile(amina.id).locator('video')).toBeVisible({ timeout: 10_000 })
    await act(onTile(amina.id), 'stop-camera')
    await expect(aminaCam).toHaveAttribute('aria-disabled', 'true')
    await expect(aminaCam).toHaveAttribute('aria-pressed', 'false')
    await expect(tile(amina.id).locator('video')).toHaveCount(0)
    await act(onTile(amina.id), 'allow-camera')
    await expect(aminaCam).not.toHaveAttribute('aria-disabled', 'true')
    await expect(aminaCam).toHaveAttribute('aria-pressed', 'false')

    // Video off: every camera stops within 2 s and the call goes on with voices.
    const theoCam = theo.page.locator('.call-bar__device[data-device="video"]')
    await theoCam.click()
    await expect(theoCam).toHaveAttribute('aria-pressed', 'true')
    await expect(theo.page.locator('.call-stage video')).toHaveCount(1, { timeout: 10_000 })
    await openCallTab(page)
    const off = Date.now()
    await video.click()
    await expect(theo.page.locator('.call-stage video')).toHaveCount(0, { timeout: 2_000 })
    console.log(`video off to cameras stopped: ${Date.now() - off} ms`)
    await expect(theo.page.locator('.call-bar__device')).toHaveCount(1)
    await expect(audio).toHaveAttribute('aria-checked', 'true')
    await expect(theo.page.locator('.call-bar')).toBeVisible()

    // Removal, from the people list: out at once, a rejoin is refused, then allowed back by the animator.
    await openCallTab(page)
    await inList(theo.id).click()
    await menu.locator('[data-action="remove"]').click()
    await expect(menu.locator('[data-cancel]')).toBeFocused()
    await axe(page)
    await menu.locator('[data-confirm]').click()
    await expect(theo.page.locator('.call-bar')).toHaveCount(0, { timeout: 2_000 })
    await expect(theo.page.locator('.call-notice__text')).toHaveText(w.notices.removed!)
    const theoSide = await openCallTab(theo.page)
    await theoSide.locator('.call__join').click()
    await expect(theoSide.locator('.call__now .field__error')).toHaveText(w.errors['removed-from-call']!)
    await expect(side.locator('.call__removed')).toContainText(theo.name)
    await side.locator('.call__allow-back').click()
    await expect(side.locator('.call__removed')).toHaveCount(0)
    await expect(theo.page.locator('.call-notice__text')).toHaveText(w.notices['allowed-back']!)
    await theoSide.locator('.call__join').click()
    await expect(theo.page.locator('.call-bar__device')).toHaveCount(1)
    await axe(amina.page)

    // The Audio call switch ends it for everyone.
    await audio.click()
    await expect(audio).toHaveAttribute('aria-checked', 'false')
    await expect(amina.page.locator('.call-bar')).toHaveCount(0, { timeout: 2_000 })
    await expect(amina.page.locator('.call-notice__text')).toHaveText(w.notices['call-ended']!)
    await closeHubCalls(amina.page)
    expect(csp).toEqual([])
    for (const g of [amina, theo]) await g.page.context().close()
  })

  test('controls: Hand to speak holds against a modified client with a real pass (research R22)', async ({ page, browser }, info) => {
    test.setTimeout(180_000)
    const locale = localeOf(info)
    const phone = (page.viewportSize()?.width ?? 1280) < 960
    const csp: string[] = []
    await quietPirikoo(page)
    await signIn(page, locale, 'e2e-controls-r22')
    const circle = await createCircle(page, locale)
    await page.goto(`/app/circles/${circle.id}`)
    const side = await openCallTab(page)
    await side.locator('[data-switch="video"]').click()
    await expect(side.locator('[data-switch="video"]')).toHaveAttribute('aria-checked', 'true')
    await side.locator('.call__join').click()
    await expect(page.locator('.call-bar__device')).toHaveCount(2)

    // Youssef never taps anything: a script takes his real pass, connects, claims every right and publishes audio.
    const rogue = await guest(browser, circle.code, 3, locale, phone, csp, { bypassCSP: true })
    await rogue.page.addScriptTag({ path: LIVEKIT_UMD })
    const result = await rogue.page.evaluate(async (circleId) => {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))!.slice('XSRF-TOKEN='.length))
      const res = await fetch(`/api/circles/${circleId}/call/token`, { method: 'POST', credentials: 'same-origin', headers: { 'X-XSRF-TOKEN': token } })
      const pass = (await res.json()) as { url: string; token: string; canSpeak: boolean }
      type Lk = {
        Room: new () => {
          connect(url: string, token: string): Promise<void>
          localParticipant: { permissions?: Record<string, unknown>; publishTrack(track: unknown): Promise<unknown> }
        }
        createLocalAudioTrack(): Promise<unknown>
      }
      const lk = (window as unknown as { LivekitClient: Lk }).LivekitClient
      const room = new lk.Room()
      await room.connect(pass.url, pass.token)
      room.localParticipant.permissions = { ...room.localParticipant.permissions, canPublish: true, canPublishSources: [] }
      const track = await lk.createLocalAudioTrack()
      let outcome = 'published'
      try {
        await Promise.race([room.localParticipant.publishTrack(track), new Promise((_, reject) => setTimeout(() => reject(new Error('no answer')), 15_000))])
      } catch (e) {
        outcome = `refused: ${e instanceof Error ? e.message : String(e)}`
      }
      Object.assign(window, { __rogue: room })
      return { canSpeak: pass.canSpeak, outcome }
    }, circle.id)
    console.log(`modified client: ${result.outcome}`)
    expect(result.canSpeak).toBe(false)
    expect(result.outcome).not.toBe('published')
    // The animator sees him in the call with his microphone off: nothing of his reaches anyone.
    await expect(page.locator(`.call-tile[data-member="${rogue.id}"]`)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`.call-tile[data-member="${rogue.id}"] .call-tile__mic`)).toBeVisible()
    await rogue.page.context().close()
  })
})

/**
 * The animator's side of the devices tests: the whiteboard runs (so the room has a chat), an open-mic video call is on,
 * and the animator is in it with the microphone on, so the others have someone to hear.
 */
async function deviceRoom(page: Page, locale: 'en' | 'ar', prefix: string, csp: string[]) {
  watchCsp(page, csp)
  await quietPirikoo(page)
  await page.context().addInitScript(trackPeerConnections)
  await signIn(page, locale, prefix)
  const circle = await createCircle(page, locale)
  await page.goto(`/app/circles/${circle.id}`)
  await page.locator('.dock__open').click()
  await expect(page.locator('.canvas__viewport')).toBeVisible({ timeout: 15_000 })
  const side = await openCallTab(page)
  await side.locator('[data-switch="video"]').click()
  await expect(side.locator('[data-switch="video"]')).toHaveAttribute('aria-checked', 'true')
  const open = side.locator('.call__mode-seg .seg__opt').nth(1)
  await open.click()
  await expect(open).toHaveAttribute('aria-pressed', 'true')
  await side.locator('.call__join').click()
  const mic = page.locator('.call-bar__device[data-device="audio"]')
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  return circle
}

async function joinCall(page: Page) {
  await (await openCallTab(page)).locator('.call__join').click()
  await expect(page.locator('.call-bar__device')).toHaveCount(2)
}

/** Sends a chat line from the room's sidebar and returns once the composer took it. */
async function say(page: Page, text: string) {
  const side = await openCallTab(page)
  await side.locator('.room-side__tab[aria-controls$="-panel-chat"]').click()
  const composer = page.locator('#composer-input')
  await composer.fill(text)
  await composer.press('Enter')
  await expect(composer).toHaveValue('')
}

/** What a scripted device does next (see `scriptedDevices`). */
const gum = (page: Page, kind: 'audio' | 'video', error: string) =>
  page.evaluate(([k, v]) => {
    ;(window as unknown as { __gum: Record<string, string> }).__gum[k] = v
  }, [kind, error] as const)
const gumCalls = (page: Page) => page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls)

test.describe('devices', () => {
  test('devices: the primer before the browser asks, audio only and heard, no camera (spec 009 US4 #1, #3)', async ({ page, browser }, info) => {
    test.setTimeout(180_000)
    const locale = localeOf(info)
    const w = words(locale)
    const phone = (page.viewportSize()?.width ?? 1280) < 960
    const csp: string[] = []
    const circle = await deviceRoom(page, locale, 'e2e-devices-primer', csp)
    const amina = await guest(browser, circle.code, 0, locale, phone, csp, { init: [scriptedDevices, devicesNotYetAllowed] })
    await gum(amina.page, 'video', 'NotFoundError')
    await joinCall(amina.page)

    // She hears the animator at once, and nothing has been asked of her devices (FR-904).
    await expect.poll(() => audioPackets(amina.page), { timeout: 10_000 }).toBeGreaterThan(0)
    expect(await gumCalls(amina.page)).toBe(0)

    // The microphone: the one sentence first, in the bar, and the browser is asked only after Continue (FR-910).
    const mic = amina.page.locator('.call-bar__device[data-device="audio"]')
    const camera = amina.page.locator('.call-bar__device[data-device="video"]')
    const primer = amina.page.locator('.call-primer')
    await mic.click()
    await expect(primer).toHaveAttribute('data-kind', 'audio')
    await expect(primer.locator('.call-primer__text')).toHaveText(w.device.primer)
    await expect(primer.locator('.btn--primary')).toBeFocused()
    expect(await gumCalls(amina.page)).toBe(0)
    await axe(amina.page)
    await primer.locator('.btn--primary').click()
    await expect(mic).toHaveAttribute('aria-pressed', 'true')
    await expect(primer).toHaveCount(0)
    // Heard: her voice lights her tile on the animator's screen.
    await expect(page.locator(`.call-tile[data-member="${amina.id}"]`)).toHaveClass(/is-speaking/, { timeout: 10_000 })

    // No camera: its own primer, then the reason; she stays in with her voice and her character.
    await camera.click()
    await expect(primer).toHaveAttribute('data-kind', 'video')
    await primer.locator('.btn--primary').click()
    const problem = amina.page.locator('.device-problem')
    await expect(problem).toHaveAttribute('data-problem', 'no-device')
    await expect(problem.locator('.device-problem__what')).toHaveText(w.device['no-device'].video)
    await expect(camera).toHaveAttribute('aria-pressed', 'false')
    await expect(mic).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(`.call-tile[data-member="${amina.id}"] .call-tile__char`)).toBeVisible()
    await expect(page.locator(`.call-tile[data-member="${amina.id}"] video`)).toHaveCount(0)
    await axe(amina.page)

    // Once per kind: the microphone off and on again asks nothing first.
    await mic.click()
    await expect(mic).toHaveAttribute('aria-pressed', 'false')
    await mic.click()
    await expect(mic).toHaveAttribute('aria-pressed', 'true')
    await expect(primer).toHaveCount(0)
    expect(csp).toEqual([])
    await amina.page.context().close()
  })

  test('devices: denied, no microphone, busy then Try again, while listening, chatting and a raised hand go on (spec 009 US4 #2, #4, #5, SC-907)', async ({ page, browser }, info) => {
    test.setTimeout(180_000)
    const locale = localeOf(info)
    const w = words(locale)
    const phone = (page.viewportSize()?.width ?? 1280) < 960
    const csp: string[] = []
    const circle = await deviceRoom(page, locale, 'e2e-devices-fail', csp)
    // The context allows both devices, so no primer: the browser's own answer comes straight back.
    const theo = await guest(browser, circle.code, 1, locale, phone, csp, { init: [scriptedDevices] })
    await joinCall(theo.page)
    const mic = theo.page.locator('.call-bar__device[data-device="audio"]')
    const problem = theo.page.locator('.device-problem')

    // Denied: what happened, how to allow it again in this browser, and Try again.
    await gum(theo.page, 'audio', 'NotAllowedError')
    const refused = Date.now()
    await mic.click()
    await expect(problem).toHaveAttribute('data-problem', 'denied')
    await expect(problem.locator('.device-problem__what')).toHaveText(w.device.denied.audio)
    const family = /Android/.test(await theo.page.evaluate(() => navigator.userAgent)) ? 'android' : 'chromium'
    await expect(problem.locator('.device-problem__how')).toHaveText(w.device.allow[family]!.replace('{{device}}', w.device.what.audio))
    await expect(mic).toHaveAttribute('aria-pressed', 'false')
    await expect(theo.page.locator('.call-primer')).toHaveCount(0)

    // Chat and a raised hand are within reach in under 5 s (SC-907), and the call keeps playing.
    await say(theo.page, locale === 'ar' ? 'أسمعكم جيدًا' : 'I can hear you all')
    expect(await hubCall(theo.page, circle.id, 'RaiseHand', [], true)).toBeNull()
    const reached = Date.now() - refused
    console.log(`denied to chat and hand: ${reached} ms`)
    expect(reached).toBeLessThan(5000)
    const heard = await audioPackets(theo.page)
    await expect.poll(() => audioPackets(theo.page), { timeout: 10_000 }).toBeGreaterThan(heard)
    await expect(theo.page.locator('.call-bar')).toBeVisible()
    await axe(theo.page)

    // No microphone at all: said plainly, still in the call.
    await gum(theo.page, 'audio', 'NotFoundError')
    await problem.locator('.device-problem__retry').click()
    await expect(problem).toHaveAttribute('data-problem', 'no-device')
    await expect(problem.locator('.device-problem__what')).toHaveText(w.device['no-device'].audio)

    // Busy: another app holds it; Try again says so again until it is free, then the microphone is on and heard.
    await gum(theo.page, 'audio', 'NotReadableError')
    await problem.locator('.device-problem__retry').click()
    await expect(problem).toHaveAttribute('data-problem', 'busy')
    await expect(problem.locator('.device-problem__what')).toHaveText(w.device.busy.audio)
    await problem.locator('.device-problem__retry').click()
    await expect(problem).toHaveAttribute('data-problem', 'busy')
    await gum(theo.page, 'audio', 'ok')
    await problem.locator('.device-problem__retry').click()
    await expect(mic).toHaveAttribute('aria-pressed', 'true')
    await expect(problem).toHaveCount(0)
    await expect(page.locator(`.call-tile[data-member="${theo.id}"]`)).toHaveClass(/is-speaking/, { timeout: 10_000 })

    await closeHubCalls(theo.page)
    expect(csp).toEqual([])
    await theo.page.context().close()
  })

  test('devices: a browser without live audio or video reads why, and still chats (spec 009 US4 #6)', async ({ page, browser }, info) => {
    test.setTimeout(120_000)
    const locale = localeOf(info)
    const w = words(locale)
    const phone = (page.viewportSize()?.width ?? 1280) < 960
    const csp: string[] = []
    const circle = await deviceRoom(page, locale, 'e2e-devices-nortc', csp)
    const lucia = await guest(browser, circle.code, 2, locale, phone, csp, { init: [noWebRtc] })
    const side = await openCallTab(lucia.page)
    await expect(side.locator('.call__unsupported')).toHaveText(w.errors.unsupported!)
    await expect(side.locator('.call__join')).toHaveCount(0)
    await axe(lucia.page)
    await say(lucia.page, locale === 'ar' ? 'سأتابع من الدردشة' : 'I will follow in the chat')
    expect(await hubCall(lucia.page, circle.id, 'RaiseHand')).toBeNull()
    expect(csp).toEqual([])
    await lucia.page.context().close()
  })

  test('devices: with UDP blocked, a guest joins over TCP and hears within 6 s (spec 009 US4 #7, SC-916)', async ({ page }, info) => {
    test.setTimeout(120_000)
    const locale = localeOf(info)
    const phone = (page.viewportSize()?.width ?? 1280) < 960
    const csp: string[] = []
    const circle = await deviceRoom(page, locale, 'e2e-devices-tcp', csp)
    // His browser sends no UDP that is not proxied: the call must come over ICE/TCP (research R28; TURN/TLS on 443 is T915's).
    const strict = await chromium.launch({ args: [...FAKE_DEVICES, '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] })
    const youssef = await guest(strict, circle.code, 3, locale, phone, csp)
    const took = await joinAndHear(youssef.page)
    console.log(`UDP blocked, join to first audio: ${took} ms`)
    expect(took).toBeLessThanOrEqual(6000)
    const protocols = await youssef.page.evaluate(async () => {
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
    expect(protocols).toEqual(['tcp'])
    expect(csp).toEqual([])
    await strict.close()
  })
})

test.describe('hands and reactions', () => {
  test('hands and reactions: raise, the place, the floor from the queue; every page claps and shows one grouped burst (spec 009 US3, US8)', async ({ page, browser }, info) => {
    test.setTimeout(480_000)
    const locale = localeOf(info)
    const ar = locale === 'ar'
    const phone = (page.viewportSize()?.width ?? 1280) < 960
    const csp: string[] = []
    watchCsp(page, csp)
    await quietPirikoo(page)
    await signIn(page, locale, 'e2e-call-hands')
    const circle = await createCircle(page, locale)
    // The animator claps too: at least four pages, so one of them can ask for reduced motion.
    const pages = Math.max(4, CLAPPERS)
    const guests = []
    for (let i = 0; i < pages - 1; i++) guests.push(await guest(browser, circle.code, i, locale, phone, csp))
    // One page asks for reduced motion (read when the page loads).
    const still = guests[2]!.page
    await still.emulateMedia({ reducedMotion: 'reduce' })
    await still.reload()
    await page.goto(`/app/circles/${circle.id}`)
    await expect(page.locator('.people__row.is-online')).toHaveCount(pages, { timeout: 20_000 })

    // An audio call in Hand to speak (the default); everyone joins.
    const side = await openCallTab(page)
    await side.locator('[data-switch="audio"]').click()
    await expect(side.locator('[data-switch="audio"]')).toHaveAttribute('aria-checked', 'true')
    await side.locator('.call__join').click()
    await expect(page.locator('.call-bar.is-connected')).toBeVisible({ timeout: 20_000 })
    for (const g of guests) {
      await (await openCallTab(g.page)).locator('.call__join').click()
      await expect(g.page.locator('.call-bar.is-connected')).toBeVisible({ timeout: 20_000 })
    }

    // Raise hand takes the microphone's place; the animator gives the floor and has no hand.
    // The first guest is Amina, the second Théo (call-helpers GUESTS).
    const [amina, theo] = [guests[0]!, guests[1]!]
    const hand = (p: Page) => p.locator('.call-bar .call-bar__hand')
    const mic = (p: Page) => p.locator('.call-bar__device[data-device="audio"]')
    await expect(mic(amina.page)).toHaveCount(0)
    await expect(hand(amina.page)).toHaveAttribute('data-hand', 'none')
    await expect(hand(page)).toHaveCount(0)
    await expect(mic(page)).toBeVisible()

    // Théo raises his hand, then Amina: she is 2nd, on her hand and in the Call tab.
    await hand(theo.page).click()
    await expect(hand(theo.page)).toHaveAttribute('data-hand', 'queue')
    await hand(amina.page).click()
    await expect(hand(amina.page)).toHaveAttribute('data-hand', 'queue')
    await expect(hand(amina.page).locator('.hand-btn__place')).toHaveText('2')
    const second = ar ? 'ترتيبك في الدور: 2' : 'You are 2nd'
    await expect(hand(amina.page)).toHaveAttribute('title', second)
    const aminaSide = await openCallTab(amina.page)
    await expect(aminaSide.locator('.call__hands .hands__place')).toHaveText(second)
    await expect(aminaSide.locator('.call__hands .hand-btn')).toHaveCount(0)

    // The animator's Call tab lists both in order and gives the floor to the first.
    const animatorSide = await openCallTab(page)
    const rows = animatorSide.locator('.call__hands .hands__row')
    await expect(rows).toHaveCount(2)
    await expect(rows.first().locator('.hands__name bdi')).toHaveText(theo.name)
    await axe(page)
    await rows.first().locator('.hands__give').click()
    // Théo can switch his microphone on now (nothing is switched on for him); his hand says he is done.
    await expect(mic(theo.page)).toBeVisible({ timeout: 5_000 })
    await expect(mic(theo.page)).not.toHaveAttribute('aria-disabled', 'true')
    await expect(mic(theo.page)).toHaveAttribute('aria-pressed', 'false')
    await expect(hand(theo.page)).toHaveAttribute('data-hand', 'floor')
    await expect(hand(amina.page).locator('.hand-btn__place')).toHaveText('1')
    await expect(aminaSide.locator('.call__hands .hands__place')).toHaveText(ar ? 'ترتيبك في الدور: 1' : 'You are 1st')
    await axe(amina.page)

    // Every page taps 👏 at once. On a phone the reactions open as a row above the bar first.
    const everyone = [page, ...guests.map((g) => g.page)]
    const claps = []
    for (const p of everyone) {
      if (phone) {
        const toggle = p.locator('.call-bar__react-toggle')
        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      }
      claps.push(p.locator(`.call-bar__${phone ? 'tray' : 'reactions'} .reaction-bar__btn[data-kind="clap"]`))
    }
    await Promise.all(claps.map((c) => c.click()))

    // Every page shows one grouped burst counting every clap, with at most 12 emoji moving; reduced motion, a still count.
    await Promise.all(everyone.map(async (p) => {
      const chips = p.locator('[data-slot="call-reactions"] .reaction-tally__chip')
      await expect(chips).toHaveCount(1)
      await expect(chips).toHaveAttribute('data-kind', 'clap')
      await expect(chips).toHaveAttribute('data-count', String(pages), { timeout: 5_000 })
    }))
    const moving = Number(await page.locator('[data-slot="call-reactions"] .reaction-layer').getAttribute('data-moving'))
    expect(moving).toBeGreaterThan(0)
    expect(moving).toBeLessThanOrEqual(12)
    await expect(still.locator('[data-slot="call-reactions"] .reaction-layer')).toHaveCount(0)
    await expect(still.locator('[data-slot="call-reactions"] .reaction-tally')).toHaveClass(/is-still/)
    // Screen readers hear a summary, never one line per clap.
    await expect(page.locator('[data-slot="call-reactions"] [role="status"]')).toHaveText(ar ? /تصفيق/ : /\d+ applause/, { timeout: 6_000 })
    // The chips sit at the inline end: on the left in Arabic.
    const bar = (await amina.page.locator('.call-bar').boundingBox())!
    const chip = (await amina.page.locator('[data-slot="call-reactions"] .reaction-tally__chip').boundingBox())!
    if (ar) expect(chip.x + chip.width / 2).toBeLessThan(bar.x + bar.width / 2)
    else expect(chip.x + chip.width / 2).toBeGreaterThan(bar.x + bar.width / 2)
    await axe(amina.page)

    // Reactions off: the bar and the floats go from the call.
    expect(await hubCall(page, circle.id, 'SetRoomSettings', [{ chat: 'open', reactions: false, pirikooQuiet: false }])).toBeNull()
    await expect(amina.page.locator('.call-bar__reactions, .call-bar__tray, .call-bar__react-toggle, [data-slot="call-reactions"]')).toHaveCount(0)
    await expect(hand(amina.page)).toBeVisible()

    expect(csp).toEqual([])
    for (const g of guests) await g.page.context().close()
  })
})
