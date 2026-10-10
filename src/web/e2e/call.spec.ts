import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { localeOf, signIn } from './helpers'
import {
  VOICE, axe, closeHubCalls, createCircle, decodedVideos, guest, hubCall, joinAndHear, openCallTab, quietPirikoo, trackPeerConnections, watchCsp,
} from './call-helpers'

// Spec 009 T925 and T926: the call on every screen and the animator's controls, against the local LiveKit of the AppHost. Chromium's fake devices (a test
// pattern and a beep) stand in for the camera and the microphone (quickstart A). Project "en" is a laptop, project "ar"
// a Pixel 7 in Arabic. E2E_CALL_PEERS sets how many pages fill the paging test (12 by default).

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${VOICE}`] },
  permissions: ['camera', 'microphone'],
})

const PEERS = Number(process.env.E2E_CALL_PEERS ?? 12)

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
    await side.locator('[data-switch="video"]').click()
    await expect(side.locator('[data-switch="video"]')).toHaveAttribute('aria-checked', 'true')
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

/** The app's own words in the test's language, so notices are checked as people read them. */
function words(locale: 'en' | 'ar') {
  const all = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')) as {
    circles: { call: { audioOn: string; videoOn: string; mode: Record<string, string>; notices: Record<string, string>; errors: Record<string, string> } }
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
    for (const g of [amina, theo]) {
      await (await openCallTab(g.page)).locator('.call__join').click()
      await expect(g.page.locator('.call-bar__device')).toHaveCount(2)
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

    // Hand to speak: no microphone without the floor. The floor goes to a raised hand, from the tile's menu, and back.
    const aminaMic = amina.page.locator('.call-bar__device').first()
    await expect(aminaMic).toHaveAttribute('aria-disabled', 'true')
    expect(await hubCall(amina.page, circle.id, 'RaiseHand', [], true)).toBeNull()
    await act(onTile(amina.id), 'give')
    await expect(aminaMic).not.toHaveAttribute('aria-disabled', 'true')
    await expect(aminaMic).toHaveAttribute('aria-pressed', 'false')
    await expect(amina.page.locator('.call-notice__text')).toHaveText(w.notices['floor-given']!)
    await expect(tile(amina.id).locator('.call-tile__floor')).toBeVisible()
    await aminaMic.click()
    await expect(aminaMic).toHaveAttribute('aria-pressed', 'true')
    await act(onTile(amina.id), 'take')
    await expect(aminaMic).toHaveAttribute('aria-disabled', 'true')
    await expect(aminaMic).toHaveAttribute('aria-pressed', 'false')

    // Open mic: anyone may speak; Mute everyone switches microphones off once and locks nothing.
    await openCallTab(page)
    const open = side.locator('.call__mode-seg .seg__opt').nth(1)
    await open.click()
    await expect(open).toHaveAttribute('aria-pressed', 'true')
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
    const aminaCam = amina.page.locator('.call-bar__device').nth(1)
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
    const theoCam = theo.page.locator('.call-bar__device').nth(1)
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
