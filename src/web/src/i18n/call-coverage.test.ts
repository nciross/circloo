import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import i18n, { LOCALES } from '.'
import en from './locales/en.json'
import fr from './locales/fr.json'
import ar from './locales/ar.json'
import es from './locales/es.json'
import { chatError, slowModeSeconds } from '../features/circles/room/grouping'

// Spec 009 T914 (FR-924, US7 #6): every string of the call, its live lines, the replies, the hands and the chat's
// announcements exists in English, French, Arabic and Spanish, with every plural form each language needs, and every
// error code of contracts/hub.md has a message where the client shows it.

type Tree = { [key: string]: string | Tree }
const files = { en, fr, ar, es } as unknown as Record<string, Tree>
const NAMESPACES = ['circles.call', 'circles.call.lines', 'circles.chat.reply', 'circles.chat.say', 'circles.hands']
const PLURAL = /_(ordinal_)?(zero|one|two|few|many|other)$/

function subtree(tree: Tree, path: string): Tree {
  return path.split('.').reduce<Tree>((at, part) => {
    const next = at[part]
    if (!next || typeof next === 'string') throw new Error(`${path} is not a group`)
    return next
  }, tree)
}

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)))
}

/** The keys a translator writes once, plural forms folded into their base. */
function bases(lng: string, ns: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [key] of leaves(subtree(files[lng]!, ns))) {
    const base = key.replace(PLURAL, '')
    out.set(base, [...(out.get(base) ?? []), key])
  }
  return out
}

/**
 * The plural forms a language uses for counts a room can reach (0 to 1000). French and Spanish have a "many" form only for
 * millions, which no call or queue reaches; Arabic uses all six below 1000.
 */
function formsUpTo1000(lng: string, ordinal: boolean): Set<string> {
  const rules = new Intl.PluralRules(lng, { type: ordinal ? 'ordinal' : 'cardinal' })
  const forms = new Set<string>()
  for (let n = 0; n <= 1000; n++) forms.add(rules.select(n))
  return forms
}

const variables = (s: string) => [...s.matchAll(/\{\{\s*(\w+)/g)].map((m) => m[1]).sort()

describe('call, lines, replies, hands: all four languages', () => {
  for (const ns of NAMESPACES) {
    it(`${ns}: the same keys in en, fr, ar and es`, () => {
      const english = [...bases('en', ns).keys()].sort()
      for (const lng of LOCALES) expect([...bases(lng, ns).keys()].sort(), `${lng} ${ns}`).toEqual(english)
    })

    it(`${ns}: every plural form each language needs, no empty string, the same placeholders as English`, () => {
      const en = new Map(leaves(subtree(files.en!, ns)))
      for (const lng of LOCALES) {
        const tree = new Map(leaves(subtree(files[lng]!, ns)))
        for (const [base, keys] of bases(lng, ns)) {
          if (keys.some((k) => PLURAL.test(k))) {
            const ordinal = keys.some((k) => k.includes('_ordinal_'))
            const needed = formsUpTo1000(lng, ordinal)
            for (const form of needed) {
              const key = `${base}_${ordinal ? 'ordinal_' : ''}${form}`
              expect(tree.has(key), `${lng} ${ns}.${key}`).toBe(true)
            }
          }
          const englishBase = [...en.keys()].find((k) => k.replace(PLURAL, '') === base)!
          for (const key of keys) {
            const text = tree.get(key)!
            expect(text.trim(), `${lng} ${ns}.${key}`).not.toBe('')
            // Arabic may drop {{count}} in a form whose word says the number ("رسالتان").
            const own = variables(text).filter((v) => v !== 'count')
            expect(own, `${lng} ${ns}.${key}`).toEqual(variables(en.get(englishBase)!).filter((v) => v !== 'count'))
          }
        }
      }
    })
  }
})

/** Every code of the contract's "Error codes" section; `slow-mode:<secondsLeft>` becomes `slow-mode`. */
function contractCodes(): string[] {
  const md = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../specs/009-live-discussion-stage/contracts/hub.md'), 'utf8')
  const section = md.split('## Error codes')[1]!.split('\n## ')[0]!
  return [...new Set([...section.matchAll(/`([a-z-]+)(?::<\w+>)?`/g)].map((m) => m[1]!))].sort()
}

/** Which client surface shows the refusals of which methods (contracts/hub.md, "Client to server"). */
const SURFACES = {
  // The Call tab, the switches, the person menu and the call's bar: circles.call.errors.
  call: ['animator-only', 'not-a-member', 'not-entered', 'audience-read-only', 'call-off', 'calls-unavailable', 'mode-invalid', 'source-invalid', 'member-invalid', 'removed-from-call', 'try-again', 'slow-down'],
  // Say and Reply: circles.chat.errors, then circles.errors (chatError); slow mode is a countdown.
  chat: ['not-a-member', 'not-entered', 'audience-read-only', 'message-invalid', 'message-unsafe', 'reply-invalid', 'chat-paused', 'slow-mode', 'slow-down'],
  // Raise, lower, the floor: circles.hands.errors.
  hands: ['not-a-member', 'not-entered', 'audience-read-only', 'animator-only', 'try-again', 'slow-down', 'animator-cannot-raise', 'hand-invalid'],
} as const

describe('every error code of contracts/hub.md has a message', () => {
  it('reads the codes from the contract, reply-invalid and audience-read-only included', () => {
    const codes = contractCodes()
    expect(codes).toContain('reply-invalid')
    expect(codes).toContain('audience-read-only')
    expect(codes).toContain('slow-mode')
    const handled = new Set<string>(Object.values(SURFACES).flat())
    expect(codes.filter((c) => !handled.has(c))).toEqual([])
  })

  for (const lng of LOCALES) {
    it(`${lng}: each surface has its own words for each code it can receive`, () => {
      const t = i18n.getFixedT(lng)
      for (const code of SURFACES.call) expect(t(`circles.call.errors.${code}`, { defaultValue: '' }), `${lng} call ${code}`).not.toBe('')
      for (const code of SURFACES.hands) expect(t(`circles.hands.errors.${code}`, { defaultValue: '' }), `${lng} hands ${code}`).not.toBe('')
      const failed = t('circles.errors.failed')
      for (const code of SURFACES.chat) {
        if (code === 'slow-mode') {
          expect(slowModeSeconds('slow-mode:7')).toBe(7)
          expect(t('circles.chat.slowWait', { count: 7 }), `${lng} slow-mode`).toMatch(/7/)
          continue
        }
        expect(chatError(t, code), `${lng} chat ${code}`).not.toBe(failed)
      }
    })
  }
})
