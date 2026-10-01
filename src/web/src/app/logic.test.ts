import { detectBrowserLocale, dirOf, isLocale } from '../i18n'
import { safeReturnTo } from '../lib/returnTo'
import { normalizeCode, validName } from '../lib/forms'
import { useUiStore } from '../stores/ui'
import en from '../i18n/locales/en.json'
import fr from '../i18n/locales/fr.json'
import ar from '../i18n/locales/ar.json'
import es from '../i18n/locales/es.json'

describe('locale detection (FR-007)', () => {
  it('picks the first supported browser language', () => {
    expect(detectBrowserLocale(['de-DE', 'fr-CA', 'en'])).toBe('fr')
    expect(detectBrowserLocale(['ar-MA'])).toBe('ar')
    expect(detectBrowserLocale(['de', 'it'])).toBe('en')
  })
  it('knows Arabic is right to left', () => {
    expect(dirOf('ar')).toBe('rtl')
    expect(dirOf('es')).toBe('ltr')
    expect(isLocale('pt')).toBe(false)
  })
  it('lets an explicit choice beat the profile language', () => {
    useUiStore.setState({ locale: 'en', explicit: false })
    useUiStore.getState().adoptProfileLocale('es')
    expect(useUiStore.getState().locale).toBe('es')
    useUiStore.getState().chooseLocale('ar')
    useUiStore.getState().adoptProfileLocale('fr')
    expect(useUiStore.getState().locale).toBe('ar')
  })
})

describe('returnTo (FR-019)', () => {
  it.each([
    ['/app/settings', '/app/settings'],
    ['https://evil.example', '/app'],
    ['//evil.example', '/app'],
    ['/\\evil.example', '/app'],
    [null, '/app'],
  ])('%s → %s', (input, expected) => expect(safeReturnTo(input)).toBe(expected))
})

describe('code and name input', () => {
  it('accepts pasted codes with spaces or dashes', () => {
    expect(normalizeCode('123 456')).toBe('123456')
    expect(normalizeCode('123-456')).toBe('123456')
    expect(normalizeCode('12a3456789')).toBe('123456')
  })
  it('validates display names after trimming', () => {
    expect(validName('  ')).toBe(false)
    expect(validName(' Amina ')).toBe(true)
    expect(validName('x'.repeat(41))).toBe(false)
  })
})

describe('translations (constitution III)', () => {
  const keys = (o: unknown, p = ''): string[] =>
    o && typeof o === 'object' && !Array.isArray(o)
      ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k))
      : [p]
  // Plural suffixes legitimately differ per language (Arabic has six forms).
  const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '')
  const enKeys = new Set(keys(en).map(base))
  it.each([['fr', fr], ['ar', ar], ['es', es]])('%s has every English key', (_, dict) => {
    const other = new Set(keys(dict).map(base))
    expect([...enKeys].filter((k) => !other.has(k))).toEqual([])
    expect([...other].filter((k) => !enKeys.has(k))).toEqual([])
  })
})
