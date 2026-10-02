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
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(8)

  // Integrations are honest: every one carries a "coming soon" lozenge (US1-4).
  await expect(page.locator('.integration')).toHaveCount(5)
  await expect(page.locator('.integration__soon')).toHaveCount(5)

  // Deal another brings another real spark in the current language (US1-3).
  const question = page.locator('.preview .teaser__question')
  await expect(question).toHaveAttribute('lang', locale)
  const first = await question.textContent()
  await page.locator('.preview .teaser .btn').click()
  await expect(question).not.toHaveText(first ?? '')
  await expect(question).toHaveAttribute('lang', locale)

  // The choice survives a reload (US1-2).
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', locale)

  // Accessibility floor: no WCAG 2.2 A/AA violations (SC-005).
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])

  // The story: six chapters, each with its clip in the visitor's language, loaded only once it gets close (#95).
  const chapters = page.locator('.chapter')
  await expect(chapters).toHaveCount(6)
  const last = page.locator('#story-pirikoo .chapter__video')
  await expect(last).not.toHaveAttribute('src', /.+/)
  await last.scrollIntoViewIfNeeded()
  await expect(last).toHaveAttribute('src', `/video/story/pirikoo-${locale}.mp4`)
  await expect(last).toHaveAttribute('poster', `/video/story/pirikoo-${locale}.jpg`)
  await expect(page.locator('.story__step[aria-current="step"]')).toHaveAttribute('href', '#story-pirikoo')

  // The call to action leads to sign-in.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('.hero__actions .btn').click()
  await expect(page).toHaveURL(/\/signin$/)
})

test('story clips stay on their poster under reduced motion and play only on request (#95)', async ({ page }, info) => {
  const locale = localeOf(info)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await pickLanguage(page, locale)

  const clip = page.locator('#story-canvas .chapter__video')
  await clip.scrollIntoViewIfNeeded()
  await expect(clip).toHaveAttribute('poster', `/video/story/canvas-${locale}.jpg`)
  // Give an autoplay every chance to happen: it must not. A visible clip would start within this time otherwise.
  await page.waitForTimeout(1500)
  expect(await clip.evaluate((v: HTMLVideoElement) => v.paused && v.currentTime === 0)).toBe(true)

  // The button plays it, and pausing it again keeps it paused.
  const toggle = page.locator('#story-canvas .chapter__toggle')
  await toggle.click()
  await expect.poll(() => clip.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
  await toggle.click()
  await expect.poll(() => clip.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
})

test('story clips follow a language switch without a reload, shared clips included (#95)', async ({ page }, info) => {
  const locale = localeOf(info)
  const other = locale === 'ar' ? 'en' : 'ar'
  await page.goto('/')
  await pickLanguage(page, locale)

  // A clip already loaded swaps to the new language.
  const chat = page.locator('#story-chat .chapter__video')
  await chat.scrollIntoViewIfNeeded()
  await expect(chat).toHaveAttribute('src', `/video/story/chat-${locale}.mp4`)
  await pickLanguage(page, other)
  await expect(page.locator('html')).toHaveAttribute('lang', other)
  await expect(chat).toHaveAttribute('src', `/video/story/chat-${other}.mp4`)

  // A clip still far away when the language changed loads in the new language once it gets close.
  const last = page.locator('#story-pirikoo .chapter__video')
  await last.scrollIntoViewIfNeeded()
  await expect(last).toHaveAttribute('src', `/video/story/pirikoo-${other}.mp4`)
  await expect(last).toHaveAttribute('poster', `/video/story/pirikoo-${other}.jpg`)

  // Wordless clips are one file for every language.
  for (const id of ['circle', 'send']) {
    const clip = page.locator(`#story-${id} .chapter__video`)
    await clip.scrollIntoViewIfNeeded()
    await expect(clip).toHaveAttribute('src', `/video/story/${id}.mp4`)
  }
})
