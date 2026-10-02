import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { codeFor, localeOf, pickLanguage } from './helpers'

async function signedIn(page: Page, locale: 'en' | 'ar') {
  const email = `e2e-circle-${locale}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`
  await page.goto('/')
  await pickLanguage(page, locale)
  await page.goto('/signin')
  await page.locator('input[type=email]').fill(email)
  await page.locator('form button[type=submit]').click()
  await expect(page.locator('input[autocomplete=one-time-code]')).toBeFocused()
  await page.locator('input[autocomplete=one-time-code]').fill(await codeFor(email))
  await page.locator('form button[type=submit]').click()
  await page.locator('input[name=displayName]').fill(locale === 'ar' ? 'نادية' : 'Nadia')
  await page.locator('form button[type=submit]').click()
  await expect(page).toHaveURL(/\/app$/)
}

const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}

test('an animator opens a circle, a guest joins by link with a character, and circloo runs an activity live (US1-US4)', async ({ page, browser }, info) => {
  // Two browsers and a streamed reply: slower than a single-page journey when the suite runs in parallel.
  test.setTimeout(90_000)
  const locale = localeOf(info)
  await signedIn(page, locale)

  // US1: create the circle with a character and activities, get a link.
  await page.locator('a[href="/app/circles/new"]').first().click()
  await expect(page).toHaveURL(/\/app\/circles\/new$/)
  await page.locator('.create__name').fill(locale === 'ar' ? 'مراجعة الاثنين' : 'Monday retro')
  await page.locator('.pick__item:has(input[value=owl])').click()
  await page.locator('.activity:has-text("") .activity__toggle').nth(5).click() // one-word check-in
  expect(await axe(page)).toEqual([])
  await page.locator('form .panel__actions button[type=submit]').click()
  await expect(page).toHaveURL(/\/app\/circles\/[0-9a-f-]+$/)
  const link = await page.locator('.invite__link').inputValue()
  expect(link).toMatch(/\/join\/[0-9A-Z]{5}-[0-9A-Z]{5}$/)

  // US2: a guest opens the link in another browser; a character is required.
  const guestCtx = await browser.newContext({ locale: locale === 'ar' ? 'ar-MA' : 'en-GB' })
  const guest = await guestCtx.newPage()
  await guest.goto(link.replace(/^https?:\/\/[^/]+/, ''))
  await expect(guest.locator('.authform__title')).toBeVisible()
  await expect(guest.locator('.pick__item:has(input[value=owl])')).toHaveClass(/is-taken/)
  await guest.locator('input[name=name]').fill(locale === 'ar' ? 'يوسف' : 'Youssef')
  await guest.locator('form button[type=submit]').click()
  await expect(guest.locator('.pick + .field__error, [role=alert]').first()).toBeVisible()
  await guest.locator('.pick__item:has(input[value=robot])').click()
  expect(await axe(guest)).toEqual([])
  await guest.locator('form button[type=submit]').click()
  await expect(guest).toHaveURL(/\/c\/[0-9a-f-]+$/)
  await expect(guest.locator('.room__wait')).toBeVisible()

  // US3: both are present on the ring.
  await expect(page.locator('.ring__seat.is-online')).toHaveCount(2)
  await expect(guest.locator('.ring__seat.is-online')).toHaveCount(2)

  // US4: the animator starts an activity; circloo opens it for everyone.
  await page.locator('.activity .btn').first().click()
  await expect(guest.locator('.chat__ai').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.chat__ai .lozenge--ai').first()).toBeVisible({ timeout: 15_000 })

  // #89: like any instant chat, the animator sees the guest typing; the message ends it.
  await guest.locator('#composer-input').pressSequentially(locale === 'ar' ? 'أنا' : 'I would', { delay: 40 })
  await expect(page.locator('.chat__typing')).toContainText(locale === 'ar' ? 'يوسف' : 'Youssef')
  await guest.locator('#composer-input').fill(locale === 'ar' ? 'أنا مستعد!' : 'I would be a cat for a day!')
  await guest.locator('#composer-input').press('Enter')
  await expect(page.locator('.chat__msg').last()).toContainText(locale === 'ar' ? 'مستعد' : 'cat')
  await expect(page.locator('.chat__typing')).toHaveCount(0)

  await page.locator('.composer__chips .chip').nth(2).click() // summarise
  await expect(guest.locator('.chat__ai').last()).toContainText(locale === 'ar' ? 'يوسف' : 'Youssef', { timeout: 15_000 })
  expect(await axe(guest)).toEqual([])
  expect(await axe(page)).toEqual([])

  // The animator closes the circle; the guest sees it ended.
  await page.locator('.room__close').click()
  await page.locator('.page-header__actions .btn--danger').click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(guest.locator('.room__ended')).toBeVisible({ timeout: 10_000 })
  await guestCtx.close()
})

test('a live board: guests post notes, the animator votes and moves them, everyone sees it (spec 004)', async ({ page, browser }, info) => {
  test.setTimeout(90_000)
  const locale = localeOf(info)
  await signedIn(page, locale)
  await page.goto('/app/circles/new')
  await page.locator('.create__name').fill(locale === 'ar' ? 'أفكار الصيف' : 'Summer ideas')
  await page.locator('.activity__toggle').first().click() // drop the default quick questions
  await page.locator('.activity:has(.activity__icon) .activity__toggle').last().click() // brainstorm
  await page.locator('form .panel__actions button[type=submit]').click()
  await expect(page).toHaveURL(/\/app\/circles\/[0-9a-f-]+$/)
  const link = await page.locator('.invite__link').inputValue()

  const guestCtx = await browser.newContext({ locale: locale === 'ar' ? 'ar-MA' : 'en-GB' })
  const guest = await guestCtx.newPage()
  await guest.goto(link.replace(/^https?:\/\/[^/]+/, ''))
  await guest.locator('input[name=name]').fill(locale === 'ar' ? 'مايا' : 'Mia')
  await guest.locator('.pick__item:has(input[value=frog])').click()
  await guest.locator('form button[type=submit]').click()
  await expect(guest).toHaveURL(/\/c\/[0-9a-f-]+$/)

  await page.locator('.activity .btn').first().click()
  await expect(guest.locator('.board')).toBeVisible({ timeout: 15_000 })

  const idea = locale === 'ar' ? 'نزهة للفريق' : 'Team picnic'
  await guest.locator('.board__col--ideas .add-note__input').fill(idea)
  await guest.locator('.board__col--ideas .swatch--green').click()
  await guest.locator('.board__col--ideas .add-note button[type=submit]').click()
  await expect(page.locator('.board__col--ideas .note-card')).toContainText(idea)
  await expect(page.locator('.board__col--ideas .note-card')).toHaveClass(/note-card--green/)

  await page.locator('.note-card__vote').first().click()
  await expect(guest.locator('.note-card__count').first()).toHaveText('1')
  await page.locator('.note-card__move').first().selectOption('next')
  await expect(guest.locator('.board__col--next .note-card')).toContainText(idea)

  expect(await axe(page)).toEqual([])
  expect(await axe(guest)).toEqual([])
  await guestCtx.close()
})
