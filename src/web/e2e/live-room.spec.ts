import { expect, request as playwrightRequest, test, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, signIn } from './helpers'

async function axe(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

/** A circle created through the API, as the signed-in animator (panda). */
async function createCircle(page: Page, locale: 'en' | 'ar') {
  return page.evaluate(async (lng) => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))!.slice('XSRF-TOKEN='.length))
    const res = await fetch('/api/circles', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ name: lng === 'ar' ? 'صف كبير' : 'Big class', activities: ['presentation', 'quick-question'], character: 'panda', locale: lng }),
    })
    const body = (await res.json()) as { id: string; joinCode: string }
    return { id: body.id, code: body.joinCode }
  }, locale)
}

/** A guest joins in the browser; with `ring` they pick that ring (1-based label) when the ring picker shows. */
async function joinInBrowser(browser: Browser, code: string, name: string, character: string, locale: 'en' | 'ar', ringLabel?: number) {
  const ctx = await browser.newContext({ locale: locale === 'ar' ? 'ar-MA' : 'en-GB' })
  const page = await ctx.newPage()
  await page.goto(`/join/${code}`)
  await page.locator('input[name=name]').fill(name)
  await page.locator(`.pick__item:has(input[value=${character}])`).click()
  if (ringLabel) await page.locator(`.rings__item:has(input[value="${ringLabel - 1}"])`).click()
  await page.locator('form button[type=submit]').click()
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]+$/)
  return page
}

/** Fills the circle quickly through the API, one guest (own cookies) per join. */
async function fillWithGuests(baseURL: string, code: string, count: number, characters: string[]) {
  for (let i = 0; i < count; i++) {
    const ctx = await playwrightRequest.newContext({ baseURL })
    await ctx.get('/api/auth/csrf')
    const token = decodeURIComponent((await ctx.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')!.value)
    const res = await ctx.post(`/api/join/${code}`, {
      data: { name: `Guest ${i}`, character: characters[i % characters.length] },
      headers: { 'X-XSRF-TOKEN': token },
    })
    expect(res.status(), await res.text()).toBe(200)
    await ctx.dispose()
  }
}

test('big circle: people share a character on their own rings, and the 101st is told the circle is full (spec 008 US1)', async ({ page, browser, baseURL }, info) => {
  test.setTimeout(240_000)
  const locale = localeOf(info)
  const ar = locale === 'ar'
  await signIn(page, locale, 'e2e-big')
  const circle = await createCircle(page, locale)

  // Kenji is the first fox: no ring to choose, he is the plain fox.
  const kenji = await joinInBrowser(browser, circle.code, ar ? 'كنزي' : 'Kenji', 'fox', locale)

  // Amina picks the fox too: the picker says one person uses it and offers her a ring.
  const ctx = await browser.newContext({ locale: ar ? 'ar-MA' : 'en-GB' })
  const amina = await ctx.newPage()
  await amina.goto(`/join/${circle.code}`)
  const fox = amina.locator('.pick__item:has(input[value=fox])')
  await expect(fox.locator('.pick__used')).toBeVisible()
  await expect(fox).not.toHaveClass(/is-taken/)
  await amina.locator('input[name=name]').fill(ar ? 'أمينة' : 'Amina')
  await fox.click()
  await expect(amina.locator('.rings__item')).toHaveCount(5)
  await expect(amina.locator('.rings__item.is-picked input')).toHaveValue('1')
  await axe(amina)
  await amina.locator('.rings__item:has(input[value="3"])').click()
  await amina.locator('form button[type=submit]').click()
  await expect(amina).toHaveURL(/\/c\/[0-9a-f-]+$/)

  // Lucía is the third fox, on the lowest ring left.
  const lucia = await joinInBrowser(browser, circle.code, ar ? 'لوسيا' : 'Lucía', 'fox', locale)

  // The animator's room tells the three foxes apart by ring, number and name.
  await page.goto(`/app/circles/${circle.id}`)
  await expect(page.locator('.people__row .char--fox')).toHaveCount(3)
  await expect(page.locator('.people__row .char--fox.char--ring-3')).toHaveCount(1)
  await expect(page.locator('.people__row .char--fox.char--ring-1')).toHaveCount(1)
  await expect(page.locator('.people__row').filter({ hasText: ar ? 'أمينة' : 'Amina' })).toHaveCount(1)
  await axe(page)

  // Fill the circle to 100 (the animator and three foxes are in), then a newcomer is told it is full.
  await fillWithGuests(baseURL!, circle.code, 96, ['owl', 'cat', 'bear', 'frog', 'bee', 'lion', 'koala', 'whale', 'dino', 'chick', 'robot', 'ghost', 'bunny', 'octopus', 'penguin', 'hamster', 'hedgehog', 'monkey', 'cactus', 'axolotl', 'raccoon', 'llama'])
  const lateCtx = await browser.newContext({ locale: ar ? 'ar-MA' : 'en-GB' })
  const late = await lateCtx.newPage()
  await late.goto(`/join/${circle.code}`)
  await expect(late.locator('.authform__notice')).toBeVisible()

  for (const p of [kenji, amina, lucia, late]) await p.context().close()
})
