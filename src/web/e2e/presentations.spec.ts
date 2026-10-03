import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, signIn } from './helpers'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test('library: upload a PowerPoint, watch it convert, read notes, hide, rename, delete (spec 006 US1)', async ({ page }, info) => {
  test.setTimeout(180_000)
  const locale = localeOf(info)
  await signIn(page, locale, 'e2e-deck')
  await page.goto('/app/presentations')
  await expect(page.locator('.deck-empty')).toBeVisible()
  await axe(page)

  // A file that is not a deck is refused with a reason, before anything is created.
  const input = page.locator('.deck-drop input[type=file]')
  await input.setInputFiles(fixture('not-a-deck.pptx'))
  await expect(page.locator('.deck-upload [role=alert]')).toBeVisible()
  await expect(page.locator('.deck-card')).toHaveCount(0)

  // The 12-slide demo deck converts with LibreOffice; the card shows progress, then a thumbnail.
  await input.setInputFiles(fixture('circloo-demo.pptx'))
  const card = page.locator('.deck-card').first()
  await expect(card.locator('.deck-card__name')).toHaveText('circloo-demo')
  await expect(card.locator('.deck-card__thumb img')).toBeVisible({ timeout: 120_000 })

  await card.locator('.deck-card__link').click()
  await expect(page).toHaveURL(/\/app\/presentations\/[0-9a-f-]+$/)
  const thumbs = page.locator('.slide-thumb')
  await expect(thumbs).toHaveCount(12)
  await expect(thumbs.nth(6)).toHaveClass(/is-hidden/)

  // Told once that animations and media are still pictures.
  const note = page.locator('.deck-note')
  await expect(note).toBeVisible()
  await note.locator('.deck-note__close').click()
  await expect(note).toHaveCount(0)

  // Speaker notes for the selected slide.
  await thumbs.nth(1).click()
  await expect(page.locator('.slide-notes__text')).toContainText('Welcome everyone')
  await expect(page.locator('.slide-preview__frame img')).toBeVisible()
  await axe(page)

  // Hide the first slide.
  await thumbs.nth(0).click()
  await page.locator('.slide-preview__bar .btn').first().click()
  await expect(thumbs.nth(0)).toHaveClass(/is-hidden/)

  // Rename, then delete the last slide.
  const name = page.locator('.deck-rename__input')
  await name.fill(locale === 'ar' ? 'لقاء الفريق' : 'Team kickoff')
  // Wait for the rename to land before the next edit (both carry the presentation version).
  const renamed = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/presentations/'))
  await name.press('Enter')
  expect((await renamed).ok()).toBe(true)
  await thumbs.nth(11).click()
  await page.locator('.slide-preview__bar .btn').last().click()
  await page.locator('.slide-preview__bar .btn--danger').click()
  await expect(thumbs).toHaveCount(11)

  // Everything is kept, and the note stays dismissed.
  await page.reload()
  await expect(page.locator('.deck-rename__input')).toHaveValue(locale === 'ar' ? 'لقاء الفريق' : 'Team kickoff')
  await expect(page.locator('.slide-thumb')).toHaveCount(11)
  await expect(page.locator('.slide-thumb').nth(0)).toHaveClass(/is-hidden/)
  await expect(page.locator('.deck-note')).toHaveCount(0)

  // Delete the presentation from the library.
  await page.goto('/app/presentations')
  await page.locator('.deck-card .deck-card__actions .btn').click()
  await page.locator('.deck-card .btn--danger').click()
  await expect(page.locator('.deck-empty')).toBeVisible()
})
