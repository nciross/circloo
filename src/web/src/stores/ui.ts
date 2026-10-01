import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { detectBrowserLocale, type Locale } from '../i18n'

interface UiState {
  locale: Locale
  /** True once the visitor picked a language themselves; that choice beats the profile (FR-007). */
  explicit: boolean
  chooseLocale: (locale: Locale) => void
  adoptProfileLocale: (locale: Locale) => void
}

const safeStorage = createJSONStorage(() => {
  try {
    return localStorage
  } catch {
    return sessionStorage
  }
})

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      locale: detectBrowserLocale(),
      explicit: false,
      chooseLocale: (locale) => set({ locale, explicit: true }),
      adoptProfileLocale: (locale) => {
        if (!get().explicit) set({ locale })
      },
    }),
    { name: 'circloo-ui', storage: safeStorage, partialize: (s) => ({ locale: s.locale, explicit: s.explicit }) },
  ),
)
