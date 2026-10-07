import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, signIn } from './helpers'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

async function axe(page: Page) {
  // Scrolled content under the sticky top bar reads as "partially obscured" targets; scan from the top.
  await page.evaluate(() => window.scrollTo(0, 0))
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
  await page.locator('.slide-preview__hide').click()
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

test('questions: add a poll and a quiz, reorder by keyboard, keep it all after reload (spec 006 US2)', async ({ page }, info) => {
  test.setTimeout(180_000)
  const locale = localeOf(info)
  const ar = locale === 'ar'
  const poll = ar ? 'ما أفضل وقت لاجتماعنا؟' : 'When should we meet?'
  const quiz = ar ? 'كم عدد أيام الأسبوع؟' : 'How many days in a week?'
  await signIn(page, locale, 'e2e-quiz')
  await page.goto('/app/presentations')
  await page.locator('.deck-drop input[type=file]').setInputFiles(fixture('circloo-demo.pptx'))
  const card = page.locator('.deck-card').first()
  await expect(card.locator('.deck-card__thumb img')).toBeVisible({ timeout: 120_000 })
  await card.locator('.deck-card__link').click()
  const thumbs = page.locator('.slide-thumb')
  await expect(thumbs).toHaveCount(12)
  await page.locator('.deck-note__close').click()
  // No quiz yet, so no podium setting.
  await expect(page.locator('.deck-settings')).toHaveCount(0)

  // A poll after slide 2: the form opens with focus on the question and the spec defaults; an empty one is refused inline.
  await thumbs.nth(1).click()
  await page.locator('.slide-preview__poll').click()
  const form = page.locator('.qform')
  await expect(form.locator('.qform__question')).toBeFocused()
  const switches = form.locator('.qform__settings [role=switch]')
  await expect(switches).toHaveCount(3)
  await expect(switches.nth(0)).toHaveAttribute('aria-checked', 'false') // several answers
  await expect(switches.nth(1)).toHaveAttribute('aria-checked', 'false') // results live
  await expect(switches.nth(2)).toHaveAttribute('aria-checked', 'true') // who answered first
  await form.locator('button[type=submit]').click()
  await expect(form.locator('.qform__question')).toHaveAttribute('aria-invalid', 'true')
  await expect(form.locator('.qform__question')).toBeFocused()
  await form.locator('.qform__question').fill(poll)
  const options = form.locator('.qform__option input.input')
  // Mixed scripts in one answer stay readable (spec US2 #6).
  await options.nth(0).fill(ar ? 'Zoom الساعة 9' : 'Morning')
  await options.nth(1).fill(ar ? 'المساء' : 'Evening')
  await form.locator('button[type=submit]').click()
  await expect(thumbs).toHaveCount(13)
  await expect(thumbs.nth(2)).toHaveClass(/is-question/)
  await expect(thumbs.nth(2)).toContainText(poll)
  // Focus lands on the new slide in the strip.
  await expect(thumbs.nth(2)).toBeFocused()

  // A quiz right after the poll: 20 s by default; three answers, the second is correct, 30 seconds.
  await page.locator('.slide-preview__quiz').click()
  await expect(form.locator('.qform__timer select')).toHaveValue('20')
  await form.locator('.qform__question').fill(quiz)
  await form.locator('.qform__options .btn').click()
  await expect(options.nth(2)).toBeFocused()
  await options.nth(0).fill('5')
  await options.nth(1).fill('7')
  await options.nth(2).fill('10')
  await form.locator('.qform__correct').nth(1).click()
  await expect(form.locator('.qform__option').nth(1)).toHaveClass(/is-correct/)
  await expect(form.locator('.qform__correct input').nth(1)).toBeChecked()
  await form.locator('.qform__timer select').selectOption('30')
  await form.locator('button[type=submit]').click()
  await expect(thumbs).toHaveCount(14)
  await expect(thumbs.nth(3)).toContainText(quiz)
  await expect(thumbs.nth(3)).toHaveAttribute('aria-current', 'true')
  await axe(page)

  // Keyboard reorder: earlier, later, earlier again; focus stays on the button.
  const earlier = page.locator('.slide-preview__up')
  const later = page.locator('.slide-preview__down')
  await earlier.focus()
  await page.keyboard.press('Enter')
  await expect(thumbs.nth(2)).toContainText(quiz)
  await expect(earlier).toBeFocused()
  await later.focus()
  await page.keyboard.press('Enter')
  await expect(thumbs.nth(3)).toContainText(quiz)
  await earlier.focus()
  await page.keyboard.press('Enter')
  await expect(thumbs.nth(2)).toContainText(quiz)
  await expect(thumbs.nth(3)).toContainText(poll)

  // Unsaved changes are not lost by picking another slide without asking.
  await form.locator('.qform__question').fill(`${quiz} ?`)
  await thumbs.nth(0).click()
  const prompt = page.locator('.deck-unsaved')
  await expect(prompt).toBeVisible()
  await prompt.locator('.btn').first().click()
  await expect(form.locator('.qform__question')).toHaveValue(`${quiz} ?`)
  await form.locator('.qform__question').fill(quiz)

  // The presentation-wide podium setting (on by default), now that there is a quiz.
  // Two presentation-wide switches live here since #171 (auto-open, then podium); the podium is the last.
  const podium = page.locator('.deck-settings .deck-setting:last-child [role=switch]')
  await expect(podium).toHaveAttribute('aria-checked', 'true')
  await podium.click()
  await expect(podium).toHaveAttribute('aria-checked', 'false')
  // The switch flips at once; wait for the server to confirm before reloading.
  await expect(podium).not.toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.deck-settings [role=alert]')).toHaveCount(0)

  await page.reload()
  await expect(thumbs).toHaveCount(14)
  await expect(thumbs.nth(2)).toContainText(quiz)
  await expect(thumbs.nth(3)).toContainText(poll)
  await expect(page.locator('.deck-settings .deck-setting:last-child [role=switch]')).toHaveAttribute('aria-checked', 'false')
  await thumbs.nth(2).click()
  await expect(form.locator('.qform__question')).toHaveValue(quiz)
  await expect(form.locator('.qform__option').nth(1)).toHaveClass(/is-correct/)
  await expect(form.locator('.qform__timer select')).toHaveValue('30')
  await thumbs.nth(3).click()
  await expect(options.nth(0)).toHaveValue(ar ? 'Zoom الساعة 9' : 'Morning')
  await axe(page)
})
