import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { codeFor, localeOf, pickLanguage } from './helpers'

async function signedIn(page: Page, locale: 'en' | 'ar') {
  const email = `e2e-int-${locale}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`
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

test('connect a service: allow-listed hosts only, secrets never shown again (spec 005)', async ({ page }, info) => {
  const locale = localeOf(info)
  await signedIn(page, locale)
  await page.goto('/app/integrations')
  await expect(page.locator('.svc')).toHaveCount(5)
  const teams = page.locator('.svc').first()
  await teams.locator('.svc__actions .btn').click()

  await teams.locator('input[name=webhookUrl]').fill('https://example.com/hook')
  await teams.locator('button[type=submit]').click()
  await expect(teams.locator('[role=alert]')).toBeVisible()

  const url = 'https://prod-01.westeurope.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?sig=secret-signature'
  await teams.locator('input[name=webhookUrl]').fill(url)
  await teams.locator('button[type=submit]').click()
  await expect(teams.locator('.lozenge--success')).toBeVisible()
  await expect(teams.locator('.svc__hint')).toHaveText('prod-01.westeurope.logic.azure.com')
  await expect(page.locator('body')).not.toContainText('secret-signature')

  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])

  await teams.locator('.svc__actions .btn').last().click()
  await expect(teams.locator('.lozenge--neutral')).toBeVisible()
})
