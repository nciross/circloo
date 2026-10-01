import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, pickLanguage } from './helpers'

test('landing explains circloo, deals icebreakers and stays in the chosen language (US1)', async ({ page }, info) => {
  const locale = localeOf(info)
  await page.goto('/')
  await pickLanguage(page, locale)

  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(7)

  // Integrations are honest: every one carries a "coming soon" stamp (US1-4).
  await expect(page.locator('.postcard')).toHaveCount(5)
  await expect(page.locator('.postcard__stamp')).toHaveCount(5)

  // Shake the fridge deals another real spark in the current language (US1-3).
  const question = page.locator('.index-card__question')
  await expect(question).toHaveAttribute('lang', locale)
  const first = await question.textContent()
  await page.locator('.index-card .magnet').click()
  await expect(question).not.toHaveText(first ?? '')
  await expect(question).toHaveAttribute('lang', locale)

  // The choice survives a reload (US1-2).
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', locale)

  // Accessibility floor: no WCAG 2.2 A/AA violations (SC-005).
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])

  // The call to action leads to sign-in.
  await page.locator('.hero__actions .magnet').click()
  await expect(page).toHaveURL(/\/signin$/)
})
