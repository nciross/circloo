import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { dirOf, type Locale } from '../i18n'
import { useUiStore } from '../stores/ui'
import { useMe, useUpdateProfile } from '../api/hooks'

/** Keeps i18next, <html lang dir> and the profile language in step with the UI store. */
export function useLocaleSync() {
  const locale = useUiStore((s) => s.locale)
  const adoptProfileLocale = useUiStore((s) => s.adoptProfileLocale)
  const { data: me } = useMe()

  useEffect(() => {
    if (me?.locale) adoptProfileLocale(me.locale)
  }, [me?.locale, adoptProfileLocale])

  useEffect(() => {
    void i18n.changeLanguage(locale)
    const html = document.documentElement
    html.lang = locale
    html.dir = dirOf(locale)
  }, [locale])
}

/** Changes the language everywhere; a signed-in user with a profile also gets it saved (US3-3). */
export function useChangeLocale() {
  const chooseLocale = useUiStore((s) => s.chooseLocale)
  const { data: me } = useMe()
  const update = useUpdateProfile()
  return (locale: Locale) => {
    chooseLocale(locale)
    if (me?.profileCompleted && me.displayName && me.locale !== locale) {
      update.mutate({ displayName: me.displayName, locale })
    }
  }
}

export function useDocumentTitle(key: string) {
  const { t, i18n: instance } = useTranslation()
  useEffect(() => {
    document.title = t(key)
  }, [t, key, instance.language])
}

/** Light, dark or the device's choice: one attribute on <html> drives every token. */
export function useThemeSync() {
  const theme = useUiStore((s) => s.theme)
  useEffect(() => {
    const html = document.documentElement
    if (theme === 'system') html.removeAttribute('data-theme')
    else html.dataset.theme = theme
  }, [theme])
}
