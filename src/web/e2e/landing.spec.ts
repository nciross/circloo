import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { codeFor, localeOf, pickLanguage } from './helpers'

const axe = async (page: import('@playwright/test').Page) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
}

test('the landing shows a live board, the story, the jobs, the free plan and the FAQ (#250)', async ({ page }, info) => {
  const locale = localeOf(info)
  await page.goto('/')
  await pickLanguage(page, locale)
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // No horizontal overflow, whatever the width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)

  // The hero is a live board; it plays on its own and is decorative for screen readers.
  await expect(page.locator('.scene')).toHaveAttribute('aria-hidden', 'true')
  await axe(page)

  // Chapters: the player swaps the clip, lazily and in the visitor's language.
  const video = page.locator('.film__video')
  await page.locator('#story-pirikoo .film__pick').click()
  await video.scrollIntoViewIfNeeded()
  await expect(video).toHaveAttribute('src', `/video/story/pirikoo-${locale}.mp4`)
  await expect(video).toHaveAttribute('poster', `/video/story/pirikoo-${locale}.jpg`)
  await expect(page.locator('.film__pick[aria-current="true"]')).toHaveCount(1)

  // Looping motion has one visible pause for the whole page (WCAG 2.2.2).
  const pause = page.locator('.hero__motion .motion-toggle')
  await expect(pause).toHaveCount(1)
  await expect(page.locator('.site')).toHaveAttribute('data-motion', 'on')
  await pause.click()
  await expect(pause).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.site')).toHaveClass(/is-still/)

  // The jobs, the free plan and the FAQ; axe once more with everything on screen.
  await expect(page.locator('.job')).toHaveCount(3)
  await expect(page.locator('#free .plan__card')).toBeVisible()
  await page.locator('.faqrow').nth(1).locator('summary').click()
  await axe(page)

  // The plan's button goes to sign-in.
  await page.locator('#free .plan__cta').click()
  await expect(page).toHaveURL(/\/signin/)
})

test('a line kept for the new-circle page fills the form after sign-up, and By hand stays plain (#247)', async ({ page }, info) => {
  const locale = localeOf(info)
  const line = locale === 'ar' ? 'مراجعة لفريقي المكوّن من 6 أشخاص، بالفرنسية' : 'A retro for my team of 6, in French'
  await page.goto('/')
  await pickLanguage(page, locale)
  // The kept line is how the site hands a description to the new-circle page.
  await page.evaluate((l) => sessionStorage.setItem('circloo-circle-prompt', l), line)
  await page.goto('/signin?returnTo=%2Fapp%2Fcircles%2Fnew')

  // Sign up through the real email code; the return path lands on the new-circle page.
  const email = `e2e-landing-${locale}-${Date.now()}@example.test`
  await page.locator('input[type=email]').fill(email)
  await page.locator('form button[type=submit]').click()
  await page.locator('input[autocomplete=one-time-code]').fill(await codeFor(email))
  await page.locator('form button[type=submit]').click()
  await page.locator('input[name=displayName]').fill(locale === 'ar' ? 'نادية' : 'Nadia')
  await page.locator('form button[type=submit]').click()
  await page.waitForURL(/\/app\/circles\/new$/)

  // Describe it is on, the line is there, the name and the activities are filled in and labelled Suggested.
  await expect(page.locator('.create__line-field')).toHaveValue(line)
  await expect(page.locator('.create__name')).not.toHaveValue('')
  await expect(page.locator('.lozenge', { hasText: /Suggested|مقترح/ })).toHaveCount(1)
  await expect(page.locator('.activity.is-on')).toHaveCount(2)
  await axe(page)

  // By hand keeps the same form; the suggested values stay, the person can change anything.
  await page.getByRole('button', { name: /By hand|يدويًا/ }).click()
  await expect(page.locator('.create__line-field')).toHaveCount(0)
  await expect(page.locator('.create__name')).not.toHaveValue('')
})

// The landing animates for every visitor, a reduced-motion system included; one Pause control stills the whole
// page and is remembered (WCAG 2.2.2, #250: the founder chose motion on by default).
test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the landing animates on arrival, one Pause stills it, and the choice is remembered', async ({ page }) => {
    await page.goto('/')
    const site = page.locator('.site')
    await expect(site).toHaveAttribute('data-motion', 'on')
    await expect.poll(() => page.evaluate(() => document.getAnimations().some((a) => a.playState === 'running'))).toBe(true)

    // One control only: Pause.
    const pause = page.locator('.hero__motion .motion-toggle')
    await expect(pause).toHaveCount(1)
    await pause.click()
    await expect(pause).toHaveAttribute('aria-pressed', 'true')
    await expect(site).toHaveClass(/is-still/)

    // The clip stays on its poster and plays only on request.
    const video = page.locator('.film__video')
    await video.scrollIntoViewIfNeeded()
    await expect(video).toHaveAttribute('poster', /\/video\/story\/circle\.jpg$/)
    await page.locator('.film__toggle').click()
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
    await page.locator('.film__toggle').click()
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)

    // The pause survives a reload.
    await page.reload()
    await expect(site).toHaveClass(/is-still/)
  })
})
