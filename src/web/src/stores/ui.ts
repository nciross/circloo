import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { detectBrowserLocale, type Locale } from '../i18n'

export type Theme = 'system' | 'light' | 'dark'
export type Autonomy = 'off' | 'suggest'

interface UiState {
  locale: Locale
  /** True once the visitor picked a language themselves; that choice beats the profile (FR-007). */
  explicit: boolean
  theme: Theme
  /** Software 3.0 dial: Off shows no proposals; Suggest proposes plans that only run once confirmed. */
  autonomy: Autonomy
  chooseLocale: (locale: Locale) => void
  setTheme: (theme: Theme) => void
  setAutonomy: (autonomy: Autonomy) => void
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
      theme: 'system',
      autonomy: 'suggest',
      setTheme: (theme) => set({ theme }),
      setAutonomy: (autonomy) => set({ autonomy }),
      chooseLocale: (locale) => set({ locale, explicit: true }),
      adoptProfileLocale: (locale) => {
        if (!get().explicit) set({ locale })
      },
    }),
    {
      name: 'circloo-ui',
      storage: safeStorage,
      // Only an explicit choice is remembered; until then every visit follows the browser language (FR-007).
      partialize: (s) => ({ ...(s.explicit ? { locale: s.locale } : {}), explicit: s.explicit, theme: s.theme, autonomy: s.autonomy }),
    },
  ),
)
