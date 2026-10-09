import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, signIn } from './helpers'

// Spec 008 US5 (T810): raised hands on a laptop (project "en", desktop) and on a phone in Arabic (project "ar", Pixel 7).

async function axe(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

/** Creates a circle through the API, as the animator. */
async function createCircle(page: Page, locale: 'en' | 'ar') {
  return page.evaluate(async (lng) => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))!.slice('XSRF-TOKEN='.length))
    const res = await fetch('/api/circles', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ name: lng === 'ar' ? 'لقاء الفريق' : 'Team kickoff', activities: ['quick-question'], character: 'panda', locale: lng }),
    })
    const body = (await res.json()) as { id: string; joinCode: string }
    return { id: body.id, code: body.joinCode }
  }, locale)
}

/** A participant joins from their own browser (a phone, or reduced motion, when asked) and lands in the room. */
async function join(browser: Browser, code: string, name: string, character: string, locale: 'en' | 'ar', options: BrowserContextOptions = {}) {
  const ctx = await browser.newContext({ ...options, locale: locale === 'ar' ? 'ar-MA' : 'en-GB' })
  const page = await ctx.newPage()
  await page.goto(`/join/${code}`)
  await page.locator('input[name=name]').fill(name)
  await page.locator(`.pick__item:has(input[value=${character}])`).click()
  await page.locator('form button[type=submit]').click()
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]+$/)
  return page
}

const side = (page: Page) => page.locator('[data-slot="room-side"]')
const tab = (page: Page, id: string) => side(page).locator(`[role=tab][aria-controls$="-panel-${id}"]`)
const rows = (page: Page) => side(page).locator('.hands__row')
const names = (page: Page) => rows(page).locator('.hands__name bdi').allTextContents()

test('hands: three hands in order, the floor, lower all, and only a count on the projector (spec 008 US5)', async ({ page, browser }, info) => {
  test.setTimeout(180_000)
  const locale = localeOf(info)
  const ar = locale === 'ar'
  await signIn(page, locale, 'e2e-hands')
  const circle = await createCircle(page, locale)
  const [a, k, l] = ar ? ['أمينة', 'كنزي', 'لوسيا'] : ['Amina', 'Kenji', 'Lucía']
  const amina = await join(browser, circle.code, a, 'robot', locale, devices['Pixel 7'])
  const kenji = await join(browser, circle.code, k, 'fox', locale)
  const lucia = await join(browser, circle.code, l, 'owl', locale, { reducedMotion: 'reduce' })
  const people = [amina, kenji, lucia]

  await page.goto(`/app/circles/${circle.id}`)
  const audience = await page.context().newPage()
  await audience.goto(`/app/circles/${circle.id}/audience`)
  await expect(audience.locator('.audience')).toHaveAttribute('data-status', 'live')

  // The animator gives the floor, never raises a hand; the line starts empty with a word on what happens.
  await tab(page, 'hands').click()
  await expect(side(page).locator('.hands .hand-btn')).toHaveCount(0)
  await expect(side(page).locator('.hands__empty')).toBeVisible()

  // Three hands, one after the other: everyone sees the same line in that order, with characters and names.
  for (const [i, p] of people.entries()) {
    await tab(p, 'hands').click()
    const raise = side(p).locator('.hands .hand-btn')
    await expect(raise).toHaveAttribute('data-hand', 'none')
    if (i === 0) {
      const box = await raise.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }
    await raise.click()
    await expect(raise).toHaveAttribute('data-hand', 'queue')
    await expect(rows(page)).toHaveCount(i + 1)
  }
  for (const p of [page, ...people]) {
    await expect(rows(p)).toHaveCount(3)
    expect(await names(p)).toEqual([a, k, l])
    await expect(rows(p).first().locator('svg.char')).toBeVisible()
  }
  await expect(side(kenji).locator('.hands__place')).toHaveText(ar ? 'ترتيبك في الدور: 2' : 'You are 2nd')
  await expect(side(lucia).locator('.hands__place')).toHaveText(ar ? 'ترتيبك في الدور: 3' : 'You are 3rd')
  await expect(tab(page, 'hands')).toContainText('3')
  // The animator hears the hand that just went up, and sees how long each has waited.
  await expect(page.locator('[data-slot="room-say"]')).toContainText(l, { timeout: 6_000 })
  await expect(rows(page).first().locator('.hands__waited')).not.toBeEmpty()
  // Arabic reads from the right: the first hand's character sits at the inline start, on the right.
  if (ar) {
    const row = (await rows(amina).first().boundingBox())!
    const char = (await rows(amina).first().locator('.hands__char').boundingBox())!
    expect(char.x + char.width).toBeGreaterThan(row.x + row.width / 2)
  }

  // The projector: the count only, never a name.
  await expect(audience.locator('.audience__hands')).toHaveText(ar ? '3 أيدٍ مرفوعة' : '3 hands up')
  for (const name of [a, k, l]) await expect(audience.locator('body')).not.toContainText(name)
  await axe(audience)

  // In People, a raised hand puts a hand on the character; it waves, except under reduced motion.
  await tab(lucia, 'people').click()
  await expect(side(lucia).locator('.people__row.is-hand .people__hand')).toHaveCount(3)
  expect(await side(lucia).locator('.people__row.is-hand .people__char').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  await tab(kenji, 'people').click()
  expect(await side(kenji).locator('.people__row.is-hand .people__char').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('hand-wave')
  await tab(lucia, 'hands').click()
  await tab(kenji, 'hands').click()
  await axe(page)
  await axe(amina)

  // The animator gives the floor to the first hand: everyone sees who is speaking and who is next.
  await rows(page).first().locator('.hands__give').click()
  for (const p of [page, ...people]) {
    await expect(side(p).locator('.hands__speaking')).toContainText(a)
    await expect(side(p).locator('.hands__next')).toContainText(k)
    await expect(rows(p)).toHaveCount(2)
  }
  if (!ar) await expect(side(kenji).locator('.hands__now-text')).toHaveText(new RegExp(`^${a} is speaking · .*${k} is next$`))
  await expect(side(amina).locator('.hands__place')).toHaveText(ar ? 'الكلمة لك الآن' : 'You have the floor')
  await expect(side(amina).locator('.hands .hand-btn')).toHaveAttribute('data-hand', 'floor')
  await expect(side(kenji).locator('.hands__place')).toHaveText(ar ? 'ترتيبك في الدور: 1' : 'You are 1st')
  await expect(audience.locator('.audience__hands')).toHaveText(ar ? 'يدان مرفوعتان' : '2 hands up')
  await axe(kenji)

  // Lower all: the line empties for everyone and the projector shows nothing.
  await side(page).locator('.hands__all').click()
  for (const p of [page, ...people]) {
    await expect(rows(p)).toHaveCount(0)
    await expect(side(p).locator('.hands__now')).toHaveCount(0)
  }
  await expect(side(kenji).locator('.hands .hand-btn')).toHaveAttribute('data-hand', 'none')
  await expect(side(kenji).locator('.hands__place')).toHaveCount(0)
  await expect(audience.locator('.audience__hands')).toHaveCount(0)
  await axe(page)

  for (const p of people) await p.context().close()
})
