import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, pickLanguage } from './helpers'

const axe = async (page: import('@playwright/test').Page) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
}

test('the landing composes a circle from one line and hands it to the new-circle page (#247)', async ({ page }, info) => {
  const locale = localeOf(info)
  await page.goto('/')
  await pickLanguage(page, locale)
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // No horizontal overflow, whatever the width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)

  // The page is still before anyone touches it: axe on the resting hero.
  await axe(page)

  // Tapping an example composes: name, seats, activity chips, the language, Pirikoo's line, then the buttons.
  const made = page.locator('.made')
  const example = page.locator('.say__example').first()
  const line = (await example.textContent()) ?? ''
  await example.click()
  await expect(page.locator('.say__field').first()).toHaveValue(line)
  await expect(made).toHaveClass(/is-done/, { timeout: 8000 })
  await expect(made.locator('.made__seat.is-in')).toHaveCount(6)
  await expect(made.locator('.made__chip')).toHaveCount(3) // two activities and the language
  await expect(made.locator('.made__chip--lang')).toHaveText(locale === 'ar' ? 'Français' : 'Français')
  await expect(made.locator('.made__say-text')).not.toBeEmpty()
  await expect(page.getByRole('status').filter({ hasText: /Preview|معاينة/ })).toHaveCount(1)
  await axe(page)

  // A new line cancels the run and composes again.
  const third = (await page.locator('.say__example').nth(2).textContent()) ?? ''
  await page.locator('.say__example').nth(2).click()
  await expect(made).toHaveClass(/is-done/, { timeout: 8000 })
  await expect(made.locator('.made__seat.is-in')).toHaveCount(5)

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

  // The FAQ opens, the jobs rows are there, axe once more with everything on screen.
  await page.locator('.faqrow').nth(1).locator('summary').click()
  await expect(page.locator('.job')).toHaveCount(3)
  await axe(page)

  // "Create this circle" carries the line to sign-in and on to the new-circle page.
  await page.locator('.made .btn--primary').click()
  await expect(page).toHaveURL(/\/signin\?returnTo=%2Fapp%2Fcircles%2Fnew$/)
  expect(await page.evaluate(() => sessionStorage.getItem('circloo-circle-prompt'))).toBe(third)
})

test('the line from the landing fills the new-circle form, and By hand stays plain (#247)', async ({ page }, info) => {
  const locale = localeOf(info)
  await page.goto('/')
  await pickLanguage(page, locale)
  const example = page.locator('.say__example').first()
  const line = (await example.textContent()) ?? ''
  await example.click()
  await expect(page.locator('.made')).toHaveClass(/is-done/, { timeout: 8000 })
  await page.locator('.made .btn--primary').click()
  await expect(page).toHaveURL(/\/signin/)

  // Sign up through the real email code; the return path lands on the new-circle page.
  const { codeFor } = await import('./helpers')
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

// A system set to reduce motion keeps the landing still, and offers a way to play it (#234, #236, #237).
test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the landing stays still, composes at once, can be played, and remembers the choice', async ({ page }) => {
    await page.goto('/')
    const site = page.locator('.site')
    await expect(site).toHaveAttribute('data-motion', 'off')
    // No auto-demo: the resting hero stays.
    await page.waitForTimeout(1800)
    await expect(page.locator('.made')).not.toHaveClass(/is-on/)
    // The page's own language (ar-MA on the phone project, en-GB on the desktop one) drives the labels below.

    // A tap composes without the sequence: everything is there at once.
    await page.locator('.say__example').first().click()
    await expect(page.locator('.made')).toHaveClass(/is-done/)
    await expect(page.locator('.made__seat.is-in')).toHaveCount(6)

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

    // One control, whose label says what a press does; the pause control joins it once motion runs.
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

    // Pause stops everything (#236): a fresh line composes at once instead of playing.
    await page.locator('.hero__motion .motion-toggle').first().click()
    await expect(site).toHaveClass(/is-still/)
    await page.locator('.say__example').nth(1).click()
    await expect(page.locator('.made')).toHaveClass(/is-done/)

    // The choice survives a reload, and going back to the system setting stills the page again.
    await page.reload()
    await expect(site).toHaveAttribute('data-motion', 'on')
    await play.click()
    await expect(site).toHaveAttribute('data-motion', 'off')
  })
})
