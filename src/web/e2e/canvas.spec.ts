import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { codeFor, localeOf, pickLanguage } from './helpers'

async function signedIn(page: Page, locale: 'en' | 'ar') {
  const email = `e2e-canvas-${locale}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`
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

test('a live canvas: cursors glide, notes land, get styled and move for everyone (#93)', async ({ page, browser }, info) => {
  test.setTimeout(90_000)
  const locale = localeOf(info)
  await signedIn(page, locale)
  await page.goto('/app/circles/new')
  await page.locator('.create__name').fill(locale === 'ar' ? 'خطة الرحلة' : 'Trip plan')
  await page.locator('.activity__toggle').first().click() // drop the default quick questions
  await page.locator('.activity[data-activity=canvas] .activity__toggle').click()
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

  // The whiteboard leads the room's dock (#244).
  await page.locator('.dock__open').click()
  const guestCanvas = guest.locator('.canvas__viewport')
  await expect(guestCanvas).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.canvas__viewport')).toBeVisible()

  // The guest's pointer shows up on the animator's canvas with their character and name.
  await guestCanvas.scrollIntoViewIfNeeded()
  const box = (await guestCanvas.boundingBox())!
  for (let i = 0; i < 6; i++) {
    await guest.mouse.move(box.x + 120 + i * 20, box.y + 100 + i * 10)
    await guest.waitForTimeout(120)
  }
  await expect(page.locator('.canvas-cursor')).toContainText(locale === 'ar' ? 'مايا' : 'Mia')

  // Double-click drops a note; everyone sees it.
  await guestCanvas.dblclick({ position: { x: 220, y: 160 } })
  const idea = locale === 'ar' ? 'نزهة على الشاطئ' : 'Beach picnic'
  await guest.locator('.canvas-draft textarea').fill(idea)
  await guest.locator('.canvas-draft textarea').press('Enter')
  const animatorNote = page.locator('.canvas-note').filter({ hasText: idea })
  await expect(animatorNote).toBeVisible()

  // The author styles it: colour and a sticker, live on the other screen.
  await guest.locator('.canvas-note__body').filter({ hasText: idea }).click()
  await guest.locator('.canvas__style .swatch--pink').click()
  await guest.locator('.canvas__style .canvas__sticker--heart').click()
  await expect(animatorNote).toHaveClass(/canvas-note--pink/)
  await expect(animatorNote.locator('.canvas-note__sticker--heart')).toBeVisible()

  // Anyone moves notes: the animator drags it, the guest sees it land elsewhere.
  const guestNote = guest.locator('.canvas-note').filter({ hasText: idea })
  const before = await guestNote.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--x'))
  await animatorNote.scrollIntoViewIfNeeded()
  const noteBox = (await animatorNote.locator('.canvas-note__body').boundingBox())!
  await page.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(noteBox.x + noteBox.width / 2 + 150, noteBox.y + noteBox.height / 2 + 40, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => guestNote.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--x'))).not.toBe(before)

  // The list view mirrors the canvas.
  await page.locator('.canvas__tools button[aria-pressed]').last().click()
  await expect(page.locator('.canvas__list-item')).toHaveCount(1)

  expect(await axe(page)).toEqual([])
  expect(await axe(guest)).toEqual([])
  await guestCtx.close()
})
