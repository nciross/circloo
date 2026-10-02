import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { codeFor, localeOf, pickLanguage } from './helpers'

test('a visitor signs up with a one-time code, sets a name and reaches home (US2, US3, US4)', async ({ page }, info) => {
  const locale = localeOf(info)
  const email = `e2e-${locale}-${Date.now()}@example.test`
  await page.goto('/app/settings')
  await expect(page).toHaveURL(/\/signin\?returnTo=%2Fapp%2Fsettings/)
  await pickLanguage(page, locale)

  await page.locator('input[type=email]').fill(email)
  await page.locator('form button[type=submit]').click()
  await expect(page.locator('input[autocomplete=one-time-code]')).toBeFocused()

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
  expect(axe.violations.map((v) => v.id)).toEqual([])

  // A wrong code is refused with a clear message.
  await page.locator('input[autocomplete=one-time-code]').fill('000000')
  await page.locator('form button[type=submit]').click()
  await expect(page.getByRole('alert')).toBeVisible()

  const code = await codeFor(email)
  await page.locator('input[autocomplete=one-time-code]').fill(`${code.slice(0, 3)} ${code.slice(3)}`)
  await page.locator('form button[type=submit]').click()
  await expect(page).toHaveURL(/\/app\/welcome/)

  const name = locale === 'ar' ? 'يوسف' : 'Théo'
  await page.locator('input[name=displayName]').fill(name)
  await page.locator('form button[type=submit]').click()
  await expect(page).toHaveURL(/\/app\/settings$/)

  await page.goto('/app')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name)

  // Sign out ends the session; app URLs need sign-in again.
  await page.locator('.account__trigger').click()
  await page.locator('.account__signout').click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/signin/)
})
