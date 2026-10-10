import { fileURLToPath } from 'node:url'
import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, signIn } from './helpers'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

async function axe(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

/** Creates a circle offering presentations through the API, as the animator. */
async function createCircle(page: Page, locale: 'en' | 'ar') {
  return page.evaluate(async (lng) => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))!.slice('XSRF-TOKEN='.length))
    const res = await fetch('/api/circles', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ name: lng === 'ar' ? 'لقاء الفريق' : 'Team kickoff', activities: ['presentation', 'quick-question'], character: 'panda', locale: lng }),
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

const clap = (page: Page) => page.locator('.reaction-bar__btn[data-kind="clap"]')
const chip = (page: Page, kind: string) => page.locator(`.reaction-tally__chip[data-kind="${kind}"]`)

test('reactions: a burst from five people floats and groups on every screen, the projector included (spec 008 US4)', async ({ page, browser }, info) => {
  test.setTimeout(240_000)
  const locale = localeOf(info)
  const ar = locale === 'ar'
  await signIn(page, locale, 'e2e-react')

  await page.goto('/app/presentations')
  await page.locator('.deck-drop input[type=file]').setInputFiles(fixture('circloo-demo.pptx'))
  await expect(page.locator('.deck-card .deck-card__thumb img').first()).toBeVisible({ timeout: 120_000 })

  const circle = await createCircle(page, locale)
  const names = ar ? ['أمينة', 'كنزي', 'لوسيا', 'يوسف', 'تيو'] : ['Amina', 'Kenji', 'Lucía', 'Youssef', 'Théo']
  const amina = await join(browser, circle.code, names[0]!, 'robot', locale, devices['Pixel 7'])
  const kenji = await join(browser, circle.code, names[1]!, 'fox', locale)
  const lucia = await join(browser, circle.code, names[2]!, 'owl', locale, { reducedMotion: 'reduce' })
  const youssef = await join(browser, circle.code, names[3]!, 'cat', locale)
  const theo = await join(browser, circle.code, names[4]!, 'frog', locale)
  const people = [amina, kenji, lucia, youssef, theo]
  // No presentation yet: no bar.
  await expect(amina.locator('.room__wait')).toBeVisible()
  await expect(amina.locator('.reaction-bar')).toHaveCount(0)

  await page.goto(`/app/circles/${circle.id}`)
  await page.locator('.activity[data-activity="presentation"] .btn').click()
  await page.locator('.picker__present').click()
  await expect(page.locator('.presenter .stage-slide[data-position="0"]')).toBeVisible()
  const [audience] = await Promise.all([page.waitForEvent('popup'), page.locator('.presenter__audience').click()])
  await expect(audience.locator('.audience .stage-slide[data-position="0"]')).toBeVisible({ timeout: 15_000 })
  for (const p of people) await expect(p.locator('.follow .stage-slide[data-position="0"]')).toBeVisible()

  // Six labelled reactions, 44px or more, for participants and the animator.
  await expect(amina.locator('.reaction-bar__btn')).toHaveCount(6)
  const box = await clap(amina).boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await expect(clap(amina)).toHaveAttribute('aria-label', ar ? 'تصفيق' : 'Applause')
  await expect(page.locator('.presenter__react .reaction-bar__btn')).toHaveCount(6)
  await axe(amina)

  // Five people clap at once, Amina three times, Kenji adds a heart: 7 claps and a heart.
  // One page clicks one at a time (two clicks at once on a page would mix their mouse events).
  await Promise.all([
    ...[kenji, lucia, youssef, theo].map((p) => clap(p).click()),
    (async () => {
      for (let i = 0; i < 3; i++) await clap(amina).click()
    })(),
  ])
  await kenji.locator('.reaction-bar__btn[data-kind="heart"]').click()
  // The screen reader hears a grouped summary in words, not one line per tap.
  await expect(kenji.locator('.follow__tally [role=status]')).toHaveText(ar ? /تصفيق/ : /\d+ applause/, { timeout: 4_000 })

  // Every screen ends on one grouped count; the presenter and the projector see the emoji float, at most 12 at once.
  for (const screen of [page, amina, lucia, audience]) {
    await expect(chip(screen, 'clap')).toHaveAttribute('data-count', '7', { timeout: 3_000 })
    await expect(chip(screen, 'heart')).toHaveAttribute('data-count', '1')
  }
  for (const screen of [page, audience]) {
    const moving = await screen.locator('.reaction-layer__float').count()
    expect(moving).toBeLessThanOrEqual(12)
  }
  await expect(audience.locator('.audience__reactions .reaction-tally__chip')).toHaveCount(2)
  // Reduced motion: a still counter beside the slide, nothing floating.
  await expect(lucia.locator('.reaction-tally.is-still')).toBeVisible()
  await expect(lucia.locator('.reaction-layer')).toHaveCount(0)
  await axe(audience)
  await axe(page)

  // Amina taps on past the hub's five in ten seconds: the bar rests with a kind line instead of failing silently.
  for (let i = 0; i < 5; i++) await clap(amina).click()
  await expect(amina.locator('.reaction-bar.is-resting')).toBeVisible()
  await expect(amina.locator('.reaction-bar__hint')).not.toBeEmpty()
  await axe(amina)

  // The chips leave once the room is quiet.
  await expect(chip(page, 'clap')).toHaveCount(0, { timeout: 6_000 })

  // The animator switches reactions off beside the notes: the bar disappears for everyone, and on again.
  const reactionsSwitch = page.locator('.presenter__settings [data-setting="reactions"]')
  await expect(reactionsSwitch).toHaveAttribute('aria-checked', 'true')
  await reactionsSwitch.click()
  await expect(reactionsSwitch).toHaveAttribute('aria-checked', 'false')
  for (const p of [page, ...people]) await expect(p.locator('.reaction-bar')).toHaveCount(0)
  await reactionsSwitch.click()
  await expect(kenji.locator('.reaction-bar')).toBeVisible()

  // Ending the presentation keeps nothing on screen.
  await page.locator('.presenter__end').click()
  await page.locator('.presenter__end-confirm').click()
  await expect(kenji.locator('.reaction-bar')).toHaveCount(0)
  await expect(audience.locator('.reaction-tally__chip')).toHaveCount(0)

  for (const p of people) await p.context().close()
})
