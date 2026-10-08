import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { codeFor, localeOf, pickLanguage } from './helpers'

const axe = async (page: import('@playwright/test').Page) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} ${v.nodes.map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message ?? '').slice(0, 90)).join(' || ')}`)).toEqual([])
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

  // Looping motion has one visible pause for the whole page (WCAG 2.2.2), remembered in the browser.
  const pause = page.locator('.hero__motion .motion-toggle')
  await expect(pause).toHaveCount(1)
  await expect(page.locator('.site')).toHaveAttribute('data-motion', 'on')
  await pause.click()
  await expect(pause).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.site')).toHaveClass(/is-still/)
  await expect(page.locator('.scene__note').first()).toHaveCSS('animation-name', 'none')
  await page.reload()
  await expect(page.locator('.site')).toHaveClass(/is-still/)
  await pause.click()
  await expect(page.locator('.site')).not.toHaveClass(/is-still/)

  // Log in swaps the board for the sign-in form in place; Escape brings the board back and focus to Log in.
  const login = page.locator('.sitebar__login')
  await login.click()
  await expect(page.locator('.hero')).toHaveClass(/is-login/)
  await expect(page.locator('.hero input[type=email]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.hero')).not.toHaveClass(/is-login/)
  await expect(login).toBeFocused()

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

test('story clips follow a language switch without a reload, wordless clips included (#95)', async ({ page }, info) => {
  const locale = localeOf(info)
  const other = locale === 'ar' ? 'en' : 'ar'
  await page.goto('/')
  await pickLanguage(page, locale)

  // The open clip swaps to the new language.
  const video = page.locator('.film__video')
  await page.locator('#story-chat .film__pick').click()
  await video.scrollIntoViewIfNeeded()
  await expect(video).toHaveAttribute('src', `/video/story/chat-${locale}.mp4`)
  await pickLanguage(page, other)
  await expect(page.locator('html')).toHaveAttribute('lang', other)
  await expect(video).toHaveAttribute('src', `/video/story/chat-${other}.mp4`)

  // Wordless clips are one file for every language.
  for (const id of ['circle', 'send']) {
    await page.locator(`#story-${id} .film__pick`).click()
    await expect(video).toHaveAttribute('src', `/video/story/${id}.mp4`)
  }
})

// A system set to reduce motion keeps the landing still (constitution IV, WCAG 2.2), and offers a way to play it.
test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the landing stays still, the clip waits for a press, motion can be played and the choice is kept', async ({ page }) => {
    await page.goto('/')
    const site = page.locator('.site')
    await expect(site).toHaveAttribute('data-motion', 'off')
    await expect(page.locator('.scene__note').first()).toHaveCSS('animation-name', 'none')

    // The clip stays on its poster and plays only on request.
    const video = page.locator('.film__video')
    await video.scrollIntoViewIfNeeded()
    await expect(video).toHaveAttribute('poster', /\/video\/story\/circle\.jpg$/)
    await page.waitForTimeout(1200)
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused && v.currentTime === 0)).toBe(true)
    await page.locator('.film__toggle').click()
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true)
    await page.locator('.film__toggle').click()
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)

    // One control, whose label says what a press does; the pause joins it once motion runs.
    await page.evaluate(() => window.scrollTo(0, 0))
    const play = page.locator('.hero__motion .motion-optin')
    await expect(page.locator('.hero__motion .motion-toggle')).toHaveCount(1)
    await expect(play).toHaveText(/Play animations|تشغيل الحركات/)
    await play.click()
    await expect(site).toHaveAttribute('data-motion', 'on')
    await expect(play).toHaveText(/Respect my system setting|احترام إعداد نظامي/)
    await expect(play).toBeFocused()
    await expect(page.getByRole('status').filter({ hasText: /Animations are playing\.|الحركات قيد التشغيل\./ })).toHaveCount(1)
    await expect(page.locator('.hero__motion .motion-toggle')).toHaveCount(2)
    await expect.poll(() => page.evaluate(() => document.getAnimations().some((a) => a.playState === 'running'))).toBe(true)

    // The choice survives a reload, and going back to the system setting stills the page again.
    await page.reload()
    await expect(site).toHaveAttribute('data-motion', 'on')
    await play.click()
    await expect(site).toHaveAttribute('data-motion', 'off')
  })
})
