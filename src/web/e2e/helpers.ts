import type { Page, TestInfo } from '@playwright/test'

export const localeOf = (info: TestInfo) => (info.project.name === 'ar' ? 'ar' : 'en')

/** Reads the newest code sent to `email` from the local Mailpit (dev only, zero cost). */
export async function codeFor(email: string): Promise<string> {
  const mailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025'
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    const body = (await res.json()) as { messages?: { Subject: string }[] }
    const code = body.messages?.[0] && /\b\d{6}\b/.exec(body.messages[0].Subject)?.[0]
    if (code) return code
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No code for ${email}`)
}

export async function pickLanguage(page: Page, locale: 'en' | 'ar') {
  // The language magnets are toggle buttons named in their own language.
  await page.getByRole('button', { name: locale === 'ar' ? 'العربية' : 'English' }).first().click()
}
