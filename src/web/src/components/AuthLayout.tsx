import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { Lock } from 'lucide-react'
import { SiteHeader } from './SiteHeader'
import { enterVariants, useReducedMotion } from '../lib/motion'

/**
 * Sign-in, first-run, join and not-found screens: the public bar, then one outlined panel on white.
 * The panel rises on the soft spring (the focal moment of these screens); it only fades under reduced motion.
 * `plain` drops the outline for pages that are a headline and a character rather than a form (404).
 */
export function AuthLayout({ children, homeTo = '/', showLanguages = true, note = true, plain = false }: {
  children: ReactNode
  homeTo?: string
  showLanguages?: boolean
  note?: boolean
  plain?: boolean
}) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  return (
    <div className="auth">
      <SiteHeader homeTo={homeTo} showLanguages={showLanguages} tone="mauve" />
      <main id="main" className="auth__main">
        <motion.div className={`auth__card${plain ? ' auth__card--plain' : ''}`} variants={enterVariants(reduced)} initial="hidden" animate="show">
          {children}
        </motion.div>
        {note ? (
          <p className="auth__note">
            <Lock size={14} aria-hidden="true" /> {t('auth.aside')}
          </p>
        ) : null}
      </main>
    </div>
  )
}
