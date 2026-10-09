import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, signIn } from './helpers'

// Spec 008 US3 (T806): the chat on a laptop (project "en", desktop) and on a phone in Arabic (project "ar", Pixel 7):
// grouping, likes, the animator's hide and show again, unsafe refused, pause, the "New messages" button and slow mode.

async function axe(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

/** Creates a circle with a chat round through the API, as the animator. */
async function createCircle(page: Page, locale: 'en' | 'ar') {
  return page.evaluate(async (lng) => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))!.slice('XSRF-TOKEN='.length))
    const res = await fetch('/api/circles', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ name: lng === 'ar' ? 'لقاء الفريق' : 'Team kickoff', activities: ['quick-question'], character: 'panda', locale: lng }),
    })
    const body = (await res.json()) as { id: string; joinCode: string }
    return { id: body.id, code: body.joinCode }
  }, locale)
}

/** A participant joins from their own browser and lands in the room. */
async function join(browser: Browser, code: string, name: string, character: string, locale: 'en' | 'ar', options: BrowserContextOptions = {}) {
  const ctx = await browser.newContext({ ...options, locale: locale === 'ar' ? 'ar-MA' : 'en-GB' })
  const page = await ctx.newPage()
  await page.goto(`/join/${code}`)
  await page.locator('input[name=name]').fill(name)
  await page.locator(`.pick__item:has(input[value=${character}])`).click()
  await page.locator('form button[type=submit]').click()
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]+$/)
  return page
}

const chat = (page: Page) => page.locator('.room__centre .chat')
const input = (page: Page) => chat(page).locator('#composer-input')
const bubble = (page: Page, text: string) => chat(page).locator('.chat__msg', { hasText: text })

/** Sends one message with Enter and waits until it is in the list. */
async function say(page: Page, text: string) {
  await input(page).fill(text)
  await input(page).press('Enter')
  await expect(bubble(page, text)).toHaveCount(1)
}

test('chat: grouping, likes, hide, unsafe refused, pause, new messages and slow mode (spec 008 US3)', async ({ page, browser }, info) => {
  test.setTimeout(240_000)
  const locale = localeOf(info)
  const ar = locale === 'ar'
  await signIn(page, locale, 'e2e-chat')
  const circle = await createCircle(page, locale)
  const [a, k] = ar ? ['أمينة', 'كنزي'] : ['Amina', 'Kenji']
  // On the Arabic project everyone is on a phone; in English, laptops.
  const device = ar ? devices['Pixel 7'] : {}
  const amina = await join(browser, circle.code, a, 'robot', locale, device)
  const kenji = await join(browser, circle.code, k, 'fox', locale, device)

  await page.goto(`/app/circles/${circle.id}`)
  await page.locator('.activity[data-activity="quick-question"] .btn').click()
  for (const p of [page, amina, kenji]) await expect(chat(p)).toBeVisible()
  // The animator writes to everyone, not to circloo.
  await chat(page).locator('.composer__top .seg__opt').nth(1).click()

  // Kenji sends two messages with emoji: one group, one name, his character with its ring, both in order.
  const [hello, ready] = ar ? ['مرحبا 👋', 'جاهز 🎉'] : ['Hello 👋', 'Ready 🎉']
  await say(kenji, hello)
  await say(kenji, ready)
  for (const p of [page, amina]) {
    const group = chat(p).locator('.chat__group').filter({ hasText: hello })
    await expect(group.locator('.chat__msg')).toHaveCount(2)
    await expect(group.locator('.chat__from')).toHaveCount(1)
    await expect(group.locator('.chat__from bdi')).toHaveText(k)
    await expect(group.locator('svg.char').first()).toBeVisible()
    expect(await group.locator('.chat__text').allTextContents()).toEqual([hello, ready])
  }
  // Yours sit at the inline end without a name: the right on a laptop, the left in Arabic.
  const mine = chat(kenji).locator('.chat__group.is-mine')
  await expect(mine.locator('.chat__from')).toHaveCount(0)
  const log = (await chat(kenji).locator('.chat__log').boundingBox())!
  const box = (await mine.locator('.chat__bubble').first().boundingBox())!
  if (ar) expect(box.x).toBeLessThan(log.x + log.width / 2)
  else expect(box.x + box.width).toBeGreaterThan(log.x + log.width / 2)

  // Amina likes "ready": "Liked" in words and a filled heart, and the count reaches everyone.
  const like = bubble(amina, ready).locator('.chat__like')
  await expect(like).toHaveAttribute('aria-pressed', 'false')
  await like.click()
  await expect(like).toHaveAttribute('aria-pressed', 'true')
  await expect(like.locator('.chat__like-label')).toHaveText(ar ? 'أعجبك' : 'Liked')
  await expect(like.locator('.chat__like-count')).toHaveText('1')
  await expect(bubble(kenji, ready).locator('.chat__likes')).toContainText('1')
  await expect(bubble(page, ready).locator('.chat__like-count')).toHaveText('1')
  // Kenji cannot like his own message.
  await expect(bubble(kenji, ready).locator('.chat__like')).toHaveCount(0)
  await axe(amina)

  // The animator hides "hello": gone for everyone else, kept and marked for the animator; then shown again.
  await bubble(page, hello).locator('.chat__hide').click()
  await expect(bubble(page, hello)).toHaveClass(/is-hidden/)
  await expect(bubble(page, hello).locator('.chat__hidden-tag')).toBeVisible()
  for (const p of [amina, kenji]) await expect(bubble(p, hello)).toHaveCount(0)
  await axe(page)
  await bubble(page, hello).locator('.chat__hide').click()
  await expect(bubble(page, hello)).not.toHaveClass(/is-hidden/)
  for (const p of [amina, kenji]) await expect(bubble(p, hello)).toHaveCount(1)
  // Back in its place, still grouped with "ready".
  expect(await chat(amina).locator('.chat__group').filter({ hasText: ready }).locator('.chat__text').allTextContents()).toEqual([hello, ready])

  // An unkind message is refused with a kind explanation and never reaches anyone.
  const unkind = ar ? 'أنت غبي' : `Why is ${k} such an idiot?`
  await input(amina).fill(unkind)
  await input(amina).press('Enter')
  await expect(chat(amina).locator('.composer .field__error')).toHaveText(ar ? /لطفاء/ : /keep it kind/)
  await expect(input(amina)).toHaveValue(unkind)
  await expect(bubble(kenji, unkind)).toHaveCount(0)
  await input(amina).fill('')

  // The animator pauses the chat: participants read on and see why they cannot write; the animator still writes.
  const settings = chat(page).locator('.chat__settings')
  await settings.locator('.seg__opt').nth(2).click()
  for (const p of [amina, kenji]) {
    await expect(chat(p).locator('.composer__paused')).toContainText(ar ? 'أوقف المنشّط الدردشة مؤقتًا' : 'The animator paused the chat')
    await expect(input(p)).toHaveCount(0)
    await expect(bubble(p, ready)).toBeVisible()
  }
  await expect(chat(page).locator('.composer__mode')).toBeVisible()
  await say(page, ar ? 'استراحة قصيرة' : 'Short break')
  await expect(bubble(amina, ar ? 'استراحة قصيرة' : 'Short break')).toHaveCount(1)
  await axe(amina)
  await settings.locator('.seg__opt').nth(0).click()
  await expect(input(amina)).toBeVisible()

  // Reading older messages: nothing moves when new ones arrive, and "New messages" takes Amina down.
  for (let i = 1; i <= 12; i++) await say(page, `${ar ? 'رسالة' : 'Message'} ${i}`)
  await expect(chat(amina).locator('.chat__msg')).toHaveCount(15)
  // A burst is announced as one count, never one line per message.
  await expect(amina.locator('[data-slot="chat-say"]')).toHaveText(ar ? /رسائل|رسالة|رسالتان/ : /new messages/, { timeout: 8_000 })
  const aminaLog = chat(amina).locator('.chat__log')
  await aminaLog.evaluate((el) => {
    el.scrollTop = 0
    el.dispatchEvent(new Event('scroll'))
  })
  await say(page, ar ? 'رسالة 13' : 'Message 13')
  await say(kenji, ar ? 'أنا هنا' : 'Still here')
  const jump = chat(amina).locator('.chat__jump')
  await expect(jump).toHaveText(ar ? /رسالتان جديدتان/ : /2 new messages/)
  expect(await aminaLog.evaluate((el) => el.scrollTop)).toBe(0)
  await axe(amina)
  await jump.click()
  await expect(jump).toHaveCount(0)
  await expect.poll(() => aminaLog.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(48)

  // Slow mode: one message every 10 seconds, with the time left after each; the animator is not limited.
  await settings.locator('.seg__opt').nth(1).click()
  const mode = chat(amina).locator('.composer__mode')
  await expect(mode).toContainText('10')
  await say(amina, ar ? 'سؤال سريع' : 'Quick question')
  await expect(mode).toHaveClass(/is-waiting/)
  await expect(mode).toHaveText(ar ? /بعد/ : /write again in \d+ second/)
  await expect(chat(amina).locator('.composer__send')).toHaveAttribute('aria-disabled', 'true')
  await axe(amina)
  await say(page, ar ? 'لا حد للمنشّط' : 'No limit for me')
  await say(page, ar ? 'ولا هنا' : 'Nor here')
  await expect(mode).not.toHaveClass(/is-waiting/, { timeout: 12_000 })
  await say(amina, ar ? 'شكرًا' : 'Thanks')

  for (const p of [amina, kenji]) await p.context().close()
})
