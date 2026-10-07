import { fileURLToPath } from 'node:url'
import { expect, request as playwrightRequest, test, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, signIn } from './helpers'

// Spec 008 US2 (T804): the room sidebar on a laptop (project "en", desktop) and the bottom sheet on a phone (project "ar", Pixel 7).

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

async function createCircle(page: Page, locale: 'en' | 'ar') {
  return page.evaluate(async (lng) => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))!.slice('XSRF-TOKEN='.length))
    const res = await fetch('/api/circles', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ name: lng === 'ar' ? 'لقاء الفريق' : 'Team kickoff', activities: ['presentation', 'start-stop-continue'], character: 'panda', locale: lng }),
    })
    const body = (await res.json()) as { id: string; joinCode: string }
    return { id: body.id, code: body.joinCode }
  }, locale)
}

/** Guests who joined through the API: they count as members (away), which makes the list long enough to window. */
async function fillWithGuests(baseURL: string, code: string, count: number) {
  const characters = ['fox', 'owl', 'cat', 'frog', 'bear', 'bunny']
  for (let i = 0; i < count; i++) {
    const ctx = await playwrightRequest.newContext({ baseURL })
    await ctx.get('/api/auth/csrf')
    const token = decodeURIComponent((await ctx.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')!.value)
    const res = await ctx.post(`/api/join/${code}`, { data: { name: `Guest ${i}`, character: characters[i % characters.length] }, headers: { 'X-XSRF-TOKEN': token } })
    expect(res.status(), await res.text()).toBe(200)
    await ctx.dispose()
  }
}

async function join(browser: Browser, code: string, name: string, character: string, locale: 'en' | 'ar', phone: boolean) {
  const ctx = await browser.newContext({ locale: locale === 'ar' ? 'ar-MA' : 'en-GB', ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}) })
  const page = await ctx.newPage()
  await page.goto(`/join/${code}`)
  await page.locator('input[name=name]').fill(name)
  await page.locator(`.pick__item:has(input[value=${character}])`).click()
  await page.locator('form button[type=submit]').click()
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]+$/)
  return page
}

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!

test('sidebar: the slide keeps two thirds, people are found and windowed, the choice is remembered; phones get a sheet (spec 008 US2)', async ({ page, browser, baseURL }, info) => {
  test.setTimeout(240_000)
  const locale = localeOf(info)
  const ar = locale === 'ar'
  const phone = (page.viewportSize()?.width ?? 1280) < 960
  await signIn(page, locale, 'e2e-side')

  await page.goto('/app/presentations')
  await page.locator('.deck-drop input[type=file]').setInputFiles(fixture('circloo-demo.pptx'))
  await expect(page.locator('.deck-card .deck-card__thumb img').first()).toBeVisible({ timeout: 120_000 })

  const circle = await createCircle(page, locale)
  await fillWithGuests(baseURL!, circle.code, 55)
  const amina = await join(browser, circle.code, ar ? 'أمينة' : 'Amina', 'robot', locale, true)

  await page.goto(`/app/circles/${circle.id}`)
  await page.locator('.activity[data-activity="presentation"] .btn').click()
  await page.locator('.picker__present').click()
  await expect(page.locator('.presenter .stage-slide[data-position="0"]')).toBeVisible()

  const side = page.locator('[data-slot="room-side"]')
  const tabs = side.getByRole('tab')
  // People, Chat and Call (#244).
  await expect(tabs).toHaveCount(3)

  // People: 57 members, so only the rows in view are drawn, each with its place in the whole list.
  const rows = side.locator('.people__row')
  expect(await rows.count()).toBeLessThan(57)
  await expect(rows.first()).toHaveAttribute('aria-setsize', '57')
  await side.getByRole('searchbox').fill(ar ? 'أمي' : 'ami')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText(ar ? 'أمينة' : 'Amina')
  await expect(rows.first()).toHaveClass(/is-online/)
  await side.getByRole('searchbox').fill('')

  if (!phone) {
    // Laptop: the slide keeps at least two thirds of the room, and collapsing gives it the rest.
    const grid = await box(page, '.room__grid')
    const main = await box(page, '.room__main')
    expect(main.width / grid.width).toBeGreaterThanOrEqual(0.66)
    await side.locator('.room-side__tools .icon-btn').click()
    const handle = side.locator('.room-side__handle')
    await expect(handle).toBeFocused()
    expect((await box(page, '.room__main')).width).toBeGreaterThan(main.width + 200)
    await page.reload()
    await expect(side.locator('.room-side__handle')).toBeVisible()
    await axe(page)
    await side.locator('.room-side__handle').click()
    await expect(tabs.first()).toBeVisible()
  } else {
    // Phone: a half-height sheet with People and Chat, mirrored in Arabic; Escape closes it to a pill.
    const sheet = await box(page, '[data-slot="room-side"]')
    expect(sheet.y).toBeGreaterThan(page.viewportSize()!.height * 0.4)
    const [first, second] = [await tabs.nth(0).boundingBox(), await tabs.nth(1).boundingBox()]
    expect(ar ? first!.x > second!.x : first!.x < second!.x).toBe(true)
    await tabs.first().focus()
    await page.keyboard.press(ar ? 'ArrowLeft' : 'ArrowRight')
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await axe(page)
    await page.keyboard.press('Escape')
    await expect(side.locator('.room-side__handle')).toBeFocused()
  }

  // A participant on a phone: the slide and its answer area are never under the sheet.
  await expect(amina.locator('.follow')).toBeVisible()
  await amina.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const follow = await box(amina, '.follow')
  const sheet = await box(amina, '[data-slot="room-side"]')
  expect(follow.y + follow.height).toBeLessThanOrEqual(sheet.y + 1)
  await amina.evaluate(() => window.scrollTo(0, 0))
  await axe(amina)
})
