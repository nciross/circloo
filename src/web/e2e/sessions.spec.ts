import { expect, test, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { codeFor, localeOf, pickLanguage } from './helpers'

async function signIn(page: Page, email: string) {
  await page.goto('/signin')
  await page.locator('input[type=email]').fill(email)
  await page.locator('form button[type=submit]').click()
  await expect(page.locator('input[autocomplete=one-time-code]')).toBeFocused()
  // Read the code only once the new one is sent; codes for this email are sequential.
  await page.waitForTimeout(400)
  const code = await codeFor(email)
  await page.locator('input[autocomplete=one-time-code]').fill(code)
  await page.locator('form button[type=submit]').click()
}

async function newDevice(browser: Browser, locale: 'en' | 'ar') {
  const ctx = await browser.newContext({ locale: locale === 'ar' ? 'ar-MA' : 'en-GB' })
  return ctx.newPage()
}

test('sign out everywhere ends the other device, which can sign in again (US4)', async ({ browser }, info) => {
  const locale = localeOf(info)
  const email = `e2e-everywhere-${locale}-${Date.now()}@example.test`

  const phone = await newDevice(browser, locale)
  await phone.goto('/')
  await pickLanguage(phone, locale)
  await signIn(phone, email)
  await expect(phone).toHaveURL(/\/app\/welcome/)
  const axeWelcome = await new AxeBuilder({ page: phone }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
  expect(axeWelcome.violations.map((v) => v.id)).toEqual([])
  await phone.locator('input[name=displayName]').fill(locale === 'ar' ? 'أمينة' : 'Amina')
  await phone.locator('form button[type=submit]').click()
  await expect(phone).toHaveURL(/\/app$/)
  const axeHome = await new AxeBuilder({ page: phone }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
  expect(axeHome.violations.map((v) => v.id)).toEqual([])

  const laptop = await newDevice(browser, locale)
  await signIn(laptop, email)
  await expect(laptop).toHaveURL(/\/app$/)

  await phone.goto('/app/settings')
  await phone.locator('.settings-devices .btn').click()
  await phone.locator('.settings-devices .btn--danger').click()
  await expect(phone).toHaveURL(/\/$/)

  // The laptop's session is gone; it lands on sign-in and can sign in again (fresh CSRF token).
  await laptop.goto('/app')
  await expect(laptop).toHaveURL(/\/signin/)
  await signIn(laptop, email)
  await expect(laptop).toHaveURL(/\/app$/)
})
