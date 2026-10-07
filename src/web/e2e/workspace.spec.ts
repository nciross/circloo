import { expect, test, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, signIn } from './helpers'

// #244: the room as a workspace. Project "en" is a laptop (work bar, centre at app height, icon rail); project "ar" is a
// Pixel 7 (work bar with the actions menu, the bottom sheet), right to left.

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

async function createCircle(page: Page, locale: 'en' | 'ar') {
  return page.evaluate(async (lng) => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))!.slice('XSRF-TOKEN='.length))
    const res = await fetch('/api/circles', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ name: lng === 'ar' ? 'ورشة الأفكار' : 'Ideas workshop', activities: ['canvas', 'quick-question', 'start-stop-continue'], character: 'panda', locale: lng }),
    })
    const body = (await res.json()) as { id: string; joinCode: string }
    return { id: body.id, code: body.joinCode }
  }, locale)
}

async function join(browser: Browser, code: string, name: string, locale: 'en' | 'ar', phone: boolean) {
  const ctx = await browser.newContext({ locale: locale === 'ar' ? 'ar-MA' : 'en-GB', ...(phone ? { viewport: { width: 412, height: 839 }, isMobile: true, hasTouch: true } : {}) })
  const page = await ctx.newPage()
  await page.goto(`/join/${code}`)
  await page.locator('input[name=name]').fill(name)
  await page.locator('.pick__item:has(input[value=fox])').click()
  await page.locator('form button[type=submit]').click()
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]+$/)
  return page
}

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!

test('workspace: work bar, whiteboard at the centre, rail and Call tab (#244)', async ({ page, browser }, info) => {
  test.setTimeout(180_000)
  const locale = localeOf(info)
  const ar = locale === 'ar'
  const phone = (page.viewportSize()?.width ?? 1280) < 960
  await signIn(page, locale, 'e2e-workspace')
  const circle = await createCircle(page, locale)
  const theo = await join(browser, circle.code, ar ? 'تيو' : 'Théo', locale, phone)

  await page.goto(`/app/circles/${circle.id}`)
  const bar = page.getByRole('region', { name: ar ? 'الغرفة' : 'Room' })
  await expect(bar.getByRole('heading', { level: 1 })).toHaveText(ar ? 'ورشة الأفكار' : 'Ideas workshop')
  await expect(bar.locator('.workbar__status')).toHaveText(ar ? 'مباشر' : 'Live')
  await expect(page.locator('.people__row.is-online')).toHaveCount(2)

  // Idle: the dock, led by the whiteboard (the one primary button), the other rounds under it.
  const open = page.locator('.dock__open')
  await expect(open).toHaveClass(/btn--primary/)
  await expect(page.locator('.dock .activity')).toHaveCount(2)
  await expect(page.locator('.dock .activity .btn--primary')).toHaveCount(0)
  await expect(page.locator('.workbar__skip')).toHaveCount(0)
  await axe(page)

  const side = page.locator('[data-slot="room-side"]')
  const tabs = side.getByRole('tab')
  if (!phone) {
    // The workspace fills the app below the bar: no page scroll, the centre and the rail side by side.
    const viewport = page.viewportSize()!
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height + 1)
    const centre = await box(page, '.room__centre')
    const workbar = await box(page, '.workbar')
    expect(centre.y).toBeGreaterThanOrEqual(workbar.y + workbar.height)
    expect(centre.y + centre.height).toBeGreaterThan(viewport.height - 32)

    // Collapse to the icon rail: the focus stays on the rail, which opens on the tab that is pressed.
    await side.locator('.room-side__tools .icon-btn').click()
    await expect(side.locator('.room-side__handle')).toBeFocused()
    await expect(tabs).toHaveCount(0)
    const railPeople = side.locator('.room-side__rail-btn[data-tab="people"]')
    await expect(railPeople).toHaveAttribute('aria-label', /People, 2 people/)
    await axe(page)
    await page.reload()
    await expect(side.locator('.room-side__rail')).toBeVisible()
    await side.locator('.room-side__rail-btn[data-tab="call"]').click()
    const call = side.getByRole('tab', { name: 'Call' })
    await expect(call).toHaveAttribute('aria-selected', 'true')
    await expect(call).toBeFocused()
  } else {
    // Phone: the animator's actions sit in a menu; the people strip opens the sheet on People.
    await expect(page.locator('.room__close')).toBeHidden()
    await page.locator('.workbar__more').click()
    await expect(page.locator('.room__close')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.workbar__more')).toBeFocused()
    await side.locator('.room-side__tools .icon-btn').last().click()
    await expect(side.locator('.room-side__handle')).toBeFocused()
    await page.locator('.workbar__people').click()
    await expect(side.getByRole('tab', { name: 'الأشخاص' })).toHaveAttribute('aria-selected', 'true')
    await tabs.last().click()
  }

  // Call tab: the real Live discussion switch, off by default; the stage is marked Soon.
  const toggle = side.getByRole('switch')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(side.locator('.call__stage .lozenge')).toBeVisible()
  await axe(page)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  const theoSide = theo.locator('[data-slot="room-side"]')
  // Participants see whether it is on, never the switch.
  await theoSide.getByRole('tab').last().click()
  await expect(theoSide.locator('.call__state')).toHaveText(ar ? 'النقاش المباشر مفعّل.' : 'Live discussion is on.')
  await expect(theoSide.getByRole('switch')).toHaveCount(0)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  // A round opens: the whiteboard fills the centre and the work bar names who started it.
  await open.click()
  await expect(page.locator('.canvas__viewport')).toBeVisible()
  const round = page.locator('.workbar__round[data-activity="canvas"]')
  if (!phone) {
    await expect(round).toContainText('Nadia')
    const centre = await box(page, '.room__centre')
    const paper = await box(page, '.canvas__viewport')
    const panel = await box(page, '.room__centre .canvas')
    expect(paper.height).toBeGreaterThanOrEqual(384)
    // The canvas panel (paper, then its one-line hint) ends where the centre ends.
    expect(Math.abs(panel.y + panel.height - (centre.y + centre.height))).toBeLessThan(4)
  }
  await expect(page.locator('.workbar__skip')).toHaveAttribute('href', '#room-centre')
  await expect(theo.locator('.canvas__viewport')).toBeVisible({ timeout: 15_000 })
  await axe(page)
  await axe(theo)

  await theo.context().close()
})
