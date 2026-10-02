import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { codeFor, localeOf, pickLanguage } from './helpers'

async function signedIn(page: Page, locale: 'en' | 'ar') {
  const email = `e2e-pirikoo-${locale}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`
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

test('Pirikoo answers from the corner, then runs a checked plan from the centre (#88)', async ({ page }, info) => {
  test.setTimeout(90_000)
  const locale = localeOf(info)
  await signedIn(page, locale)

  // The bird in the corner opens a compact conversation, ready to type.
  await page.locator('.pkl__button').click()
  const panel = page.locator('.pkc--panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('textarea')).toBeFocused()
  expect(await axe(page)).toEqual([])

  // A question gets a streamed answer, in the person's language.
  await panel.locator('textarea').fill(locale === 'ar' ? 'كيف أدعو الناس؟' : 'How do I invite people?')
  await panel.locator('textarea').press('Enter')
  const answer = panel.locator('.pkc__pk').last()
  await expect(answer.locator('.pkc__text')).toContainText(locale === 'ar' ? 'ادعُ الناس' : 'Invite people', { timeout: 15_000 })
  await expect(answer.locator('.pkc__caret')).toHaveCount(0, { timeout: 15_000 })
  await expect(panel.locator('.pkc__disclaimer')).toBeVisible()

  // Escape closes it, and focus goes back to the bird.
  await panel.locator('textarea').press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.pkl__button')).toBeFocused()

  // Ctrl+K opens the same conversation in the middle of the screen.
  await page.keyboard.press('Control+k')
  const center = page.locator('.pkc--center')
  await expect(center).toBeVisible()
  await expect(center.locator('.pkc__me')).toHaveCount(1)

  // Plain words become a plan: nothing changes until "Run the plan".
  await center.locator('textarea').fill(locale === 'ar' ? 'انتقل إلى الوضع الداكن' : 'Switch to dark mode')
  await center.locator('textarea').press('Enter')
  await expect(center.locator('.pk-plan .plan-steps__item')).toHaveCount(1)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
  await center.locator('.pk-plan__run').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(center.locator('.pk-plan__done')).toHaveCount(1)
  expect(await axe(page)).toEqual([])
})
