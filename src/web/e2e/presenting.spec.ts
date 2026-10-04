import { fileURLToPath } from 'node:url'
import { expect, test, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { localeOf, signIn } from './helpers'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

async function axe(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

/** Creates a circle offering presentations through the API, as the animator, and returns its id and join code. */
async function createCircle(page: Page, locale: 'en' | 'ar') {
  return page.evaluate(async (lng) => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))!.slice('XSRF-TOKEN='.length))
    const res = await fetch('/api/circles', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ name: lng === 'ar' ? 'لقاء الفريق' : 'Team kickoff', activities: ['presentation', 'quick-question'], character: 'panda', locale: lng }),
    })
    const body = (await res.json()) as { id: string; joinCode: string }
    return { id: body.id, code: body.joinCode }
  }, locale)
}

/** A participant joins from their own browser with a character and lands in the room. */
async function join(browser: Browser, code: string, name: string, character: string, locale: 'en' | 'ar') {
  const ctx = await browser.newContext({ locale: locale === 'ar' ? 'ar-MA' : 'en-GB' })
  const page = await ctx.newPage()
  await page.goto(`/join/${code}`)
  await page.locator('input[name=name]').fill(name)
  await page.locator(`.pick__item:has(input[value=${character}])`).click()
  await page.locator('form button[type=submit]').click()
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]+$/)
  return page
}

const onSlide = (page: Page, position: number, root = '.follow') => page.locator(`${root} .stage-slide[data-position="${position}"]`)

test('presenting: everyone follows the animator live, a late joiner lands in place, the audience screen mirrors it (spec 006 US3)', async ({ page, browser }, info) => {
  test.setTimeout(240_000)
  const locale = localeOf(info)
  const ar = locale === 'ar'
  await signIn(page, locale, 'e2e-present')

  // A ready presentation: the 12-slide demo (slide 7 hidden), so 11 slides are shown.
  await page.goto('/app/presentations')
  await page.locator('.deck-drop input[type=file]').setInputFiles(fixture('circloo-demo.pptx'))
  await expect(page.locator('.deck-card .deck-card__thumb img').first()).toBeVisible({ timeout: 120_000 })

  const circle = await createCircle(page, locale)
  const amina = await join(browser, circle.code, ar ? 'أمينة' : 'Amina', 'robot', locale)
  const kenji = await join(browser, circle.code, ar ? 'كنزي' : 'Kenji', 'fox', locale)
  await expect(amina.locator('.room__wait')).toBeVisible()

  // The animator picks the presentation from the activity grid.
  await page.goto(`/app/circles/${circle.id}`)
  await page.locator('.activity[data-activity="presentation"] .btn').click()
  await expect(page.locator('.picker__item')).toHaveCount(1)
  await axe(page)
  await page.locator('.picker__present').click()

  // Everyone sees slide 1; the animator sees the presenter view with the next slide and the count of followers.
  await expect(page.locator('.presenter .stage-slide[data-position="0"]')).toBeVisible()
  await expect(page.locator('.presenter__count')).toContainText(ar ? '1' : 'Slide 1 of 11')
  await expect(page.locator('.presenter__followers')).toHaveAttribute('data-count', '2')
  await expect(onSlide(amina, 0)).toBeVisible()
  await expect(onSlide(kenji, 0)).toBeVisible()

  // "Open audience screen" opens a window that follows too, with the join link and QR code between questions.
  const [audience] = await Promise.all([page.waitForEvent('popup'), page.locator('.presenter__audience').click()])
  // First load of a lazy page, sign-in check and hub connection: give it room under a parallel run.
  await expect(onSlide(audience, 0, '.audience')).toBeVisible({ timeout: 15_000 })
  await expect(audience.locator('.audience__url')).toContainText(`/join/${circle.code}`)
  await expect(audience.locator('.audience__qr')).toBeVisible()
  await axe(audience)
  // It does not count as someone following.
  await expect(page.locator('.presenter__followers')).toHaveAttribute('data-count', '2')

  // Five moves with the keyboard; every screen follows (SC-603: each change shows in under a second on the local stack).
  // In Arabic the left arrow goes forward; Page Down works in every language. The median must stay under a second; a
  // single slow move up to two is tolerated, since parallel test runs share this machine with deck conversions.
  await page.locator('.presenter__count').click()
  const latencies: number[] = []
  for (let position = 1; position <= 5; position++) {
    const sent = Date.now()
    await page.keyboard.press(position % 2 === 0 ? 'PageDown' : ar ? 'ArrowLeft' : 'ArrowRight')
    await Promise.all([
      expect(onSlide(page, position, '.presenter')).toBeVisible({ timeout: 2_000 }),
      expect(onSlide(amina, position)).toBeVisible({ timeout: 2_000 }),
      expect(onSlide(kenji, position)).toBeVisible({ timeout: 2_000 }),
      expect(onSlide(audience, position, '.audience')).toBeVisible({ timeout: 2_000 }),
    ])
    latencies.push(Date.now() - sent)
  }
  const median = [...latencies].sort((x, y) => x - y)[2]
  console.log(`slide changes on every screen (ms): ${latencies.join(', ')}; median ${median}`)
  expect(median).toBeLessThan(1_000)

  // The demo deck has notes on slide 5 (position 4) for the animator only; slide 6 (position 5) has none.
  await page.keyboard.press('PageUp')
  const notes = (await page.locator('.presenter__notes-text').innerText()).trim().slice(0, 20)
  expect(notes.length).toBeGreaterThan(0)
  for (const screen of [amina, kenji, audience]) await expect(screen.getByText(notes, { exact: false })).toHaveCount(0)

  // A late joiner lands on the current slide.
  const lucia = await join(browser, circle.code, ar ? 'لوسيا' : 'Lucía', 'owl', locale)
  await expect(onSlide(lucia, 4)).toBeVisible()
  await axe(lucia)

  // B blanks every screen and brings the slide back.
  await page.keyboard.press('b')
  await expect(amina.locator('.stage-slide.is-blank')).toBeVisible({ timeout: 1_000 })
  // The projector stays dark while blank.
  await expect(audience.locator('.stage-slide.is-blank')).toHaveCSS('background-color', 'rgb(11, 15, 20)')
  await page.keyboard.press('b')
  await expect(amina.locator('.stage-slide.is-blank')).toHaveCount(0)
  await axe(page)

  // Ending takes everyone out together.
  await page.locator('.presenter__end').click()
  await page.locator('.presenter__end-confirm').click()
  await expect(amina.locator('.follow')).toHaveCount(0)
  await expect(kenji.locator('.follow')).toHaveCount(0)
  await expect(audience.locator('.audience__stage')).toHaveCount(0)

  for (const p of [amina, kenji, lucia]) await p.context().close()
})

/** Adds a question after the deck's first slide through the API, as the animator's editor does. */
async function addQuestion(page: Page, presentationId: string, question: Record<string, unknown>) {
  await page.evaluate(async ({ id, body }) => {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))!.slice('XSRF-TOKEN='.length))
    const deck = (await (await fetch(`/api/presentations/${id}`, { credentials: 'same-origin' })).json()) as { version: number; slides: { id: string }[] }
    const res = await fetch(`/api/presentations/${id}/questions`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ ...body, version: deck.version, afterSlideId: deck.slides[0].id }),
    })
    if (!res.ok) throw new Error(`question: ${res.status}`)
  }, { id: presentationId, body: question })
}

test('answering and reveal: phones answer polls and a server-timed quiz, then everyone sees the results and who was first (spec 006 US4, US5)', async ({ page, browser }, info) => {
  test.setTimeout(240_000)
  const locale = localeOf(info)
  const ar = locale === 'ar'
  await signIn(page, locale, 'e2e-answer')

  await page.goto('/app/presentations')
  await page.locator('.deck-drop input[type=file]').setInputFiles(fixture('circloo-demo.pptx'))
  await expect(page.locator('.deck-card .deck-card__thumb img').first()).toBeVisible({ timeout: 120_000 })
  const deckId = (await page.locator('.deck-card a').first().getAttribute('href'))!.split('/').pop()!
  // After slide 1: a poll, a 10-second quiz, a poll without the spotlight, and a poll nobody will answer (each lands
  // right after slide 1, so they are added last to first).
  await addQuestion(page, deckId, {
    kind: 'poll', question: ar ? 'هل نلتقي غدًا؟' : 'Meet again tomorrow?',
    options: [{ id: 'a', text: ar ? 'نعم' : 'Yes' }, { id: 'b', text: ar ? 'لا' : 'No' }],
  })
  await addQuestion(page, deckId, {
    kind: 'poll', question: ar ? 'قهوة أم شاي؟' : 'Coffee or tea?', showFirst: false,
    options: [{ id: 'a', text: ar ? 'قهوة' : 'Coffee' }, { id: 'b', text: ar ? 'شاي' : 'Tea' }],
  })
  await addQuestion(page, deckId, {
    kind: 'quiz', question: ar ? 'كم يساوي ٧ × ٨؟' : 'What is 7 × 8?', timerSeconds: 10, correctOption: 'b',
    options: [{ id: 'a', text: '54' }, { id: 'b', text: '56' }, { id: 'c', text: '58' }],
  })
  await addQuestion(page, deckId, {
    kind: 'poll', question: ar ? 'ماذا نأكل اليوم؟' : 'Lunch today?',
    options: [{ id: 'a', text: ar ? 'كسكس' : 'Couscous' }, { id: 'b', text: ar ? 'سوشي' : 'Sushi' }],
  })

  const circle = await createCircle(page, locale)
  const amina = await join(browser, circle.code, ar ? 'أمينة' : 'Amina', 'robot', locale)
  const kenji = await join(browser, circle.code, ar ? 'كنزي' : 'Kenji', 'fox', locale)

  await page.goto(`/app/circles/${circle.id}`)
  await page.locator('.activity[data-activity="presentation"] .btn').click()
  await page.locator('.picker__present').click()
  await expect(page.locator('.presenter .stage-slide[data-position="0"]')).toBeVisible()
  const [audience] = await Promise.all([page.waitForEvent('popup'), page.locator('.presenter__audience').click()])
  await expect(onSlide(audience, 0, '.audience')).toBeVisible({ timeout: 15_000 })

  // The poll: nobody can answer until the animator opens it.
  await page.locator('.presenter__next').click()
  await expect(amina.locator('.answer-pad')).toBeVisible()
  await expect(amina.locator('.answer-pad__option').first()).toHaveAttribute('aria-disabled', 'true')
  await axe(amina)
  await page.locator('.presenter__open').click()
  await expect(page.locator('.answer-progress__count')).toContainText(ar ? 'لم يُجب أحد من 2' : '0 of 2 answered')
  await expect(page.locator('.answer-progress__pending li')).toHaveCount(2)

  // Amina answers, then changes her mind; one answer counts.
  await amina.locator('.answer-pad__option').nth(0).click()
  await expect(amina.locator('.answer-pad__option').nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.answer-progress__count')).toContainText(ar ? 'أجاب واحد من 2' : '1 of 2 answered')
  await amina.locator('.answer-pad__option').nth(1).click()
  await expect(amina.locator('.answer-pad__option').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(amina.locator('.answer-pad__option').nth(0)).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.answer-progress__pending li')).toHaveCount(1)
  // Participants never see counts before the reveal.
  await expect(kenji.locator('.answer-progress, .share')).toHaveCount(0)
  await axe(page)

  // Closing answers: the pad says so and nothing more can be sent.
  await page.locator('.presenter__lock').click()
  await expect(page.locator('.presenter__closed')).toBeVisible()
  await expect(kenji.locator('.answer-pad__option').first()).toHaveAttribute('aria-disabled', 'true')
  await expect(amina.locator('.answer-pad__status')).toContainText(ar ? 'احتُسبت' : 'Your answer counted')

  // The quiz: a server countdown, one final answer, and it locks itself when time is up.
  await page.locator('.presenter__next').click()
  await page.locator('.presenter__open').click()
  await expect(kenji.locator('.answer-pad__countdown')).toBeVisible()
  await expect(page.locator('.presenter__countdown')).toBeVisible()
  await kenji.locator('.answer-pad__option').nth(1).click()
  await expect(kenji.locator('.answer-pad__option').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(kenji.locator('.answer-pad__option').nth(0)).toHaveAttribute('aria-disabled', 'true')
  await expect(page.locator('.answer-progress__count')).toContainText(ar ? 'أجاب واحد من 2' : '1 of 2 answered')
  await axe(kenji)
  await expect(page.locator('.presenter__closed')).toBeVisible({ timeout: 15_000 })
  await expect(amina.locator('.answer-pad__status')).toContainText(ar ? 'مغلقة' : 'Answers are closed.')

  // Reveal (US5): every screen shows the same results; the quiz marks its right answer and the first right answerer.
  await page.locator('.presenter__reveal').click()
  for (const screen of [page, amina, kenji, audience]) {
    await expect(screen.locator('.reveal__option.is-correct')).toHaveCount(1)
    await expect(screen.locator('.reveal__option').nth(1)).toHaveClass(/is-correct/)
    await expect(screen.locator('.reveal__spotlight-who')).toContainText(ar ? 'كنزي' : 'Kenji')
  }
  await expect(kenji.locator('.reveal__option.is-mine')).toHaveCount(1)
  await expect(kenji.locator('.answer-pad__status.is-right')).toBeVisible()
  await axe(audience)
  await expect(page.locator('.presenter__closed')).toContainText(ar ? 'النتائج معروضة' : 'Results shown')
  await axe(kenji)

  // Back to the poll, revealed on a phone set to reduced motion: final figures at once, no confetti.
  await amina.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('.presenter__prev').click()
  await page.locator('.presenter__reveal').click()
  await expect(amina.locator('.reveal')).toHaveClass(/is-still/)
  await expect(amina.locator('.reveal__percent').nth(1)).toHaveText(/100/)
  await expect(amina.locator('.reveal__confetti')).toHaveCount(0)
  await expect(amina.locator('.reveal__option.is-winner .reveal__mark.is-winner')).toHaveCount(1)
  await expect(page.locator('.reveal__spotlight-who')).toContainText(ar ? 'أمينة' : 'Amina')
  await axe(page)

  // A poll without the spotlight: results, but no name anywhere.
  await page.locator('.presenter__next').click()
  await page.locator('.presenter__next').click()
  await page.locator('.presenter__open').click()
  await kenji.locator('.answer-pad__option').nth(0).click()
  await expect(page.locator('.answer-progress__count')).toContainText(ar ? 'أجاب واحد من 2' : '1 of 2 answered')
  await page.locator('.presenter__reveal').click()
  for (const screen of [page, amina, kenji, audience]) {
    await expect(screen.locator('.reveal__option')).toHaveCount(2)
    await expect(screen.locator('.reveal__spotlight')).toHaveCount(0)
  }

  // A poll nobody answered: a friendly line instead of empty bars.
  await page.locator('.presenter__next').click()
  await page.locator('.presenter__open').click()
  await page.locator('.presenter__reveal').click()
  for (const screen of [page, amina, kenji, audience]) await expect(screen.locator('.reveal__empty')).toBeVisible()

  for (const p of [amina, kenji]) await p.context().close()
})
