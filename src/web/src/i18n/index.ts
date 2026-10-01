import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import fr from './locales/fr.json'
import ar from './locales/ar.json'
import es from './locales/es.json'

export const LOCALES = ['en', 'fr', 'ar', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

export const dirOf = (locale: Locale): 'rtl' | 'ltr' => (locale === 'ar' ? 'rtl' : 'ltr')

/** Browser preference → first supported language, else English (FR-007). */
export function detectBrowserLocale(languages: readonly string[] = navigator.languages ?? []): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return 'en'
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr }, ar: { translation: ar }, es: { translation: es } },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: LOCALES,
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
