import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { Lock } from 'lucide-react'
import { SiteHeader } from './SiteHeader'
import { FaceMark } from './Brand'
import { enterVariants, useReducedMotion } from '../lib/motion'

/**
 * Sign-in and first-run screens: one paper card on the ground, the face as a watermark in ink.
 * The card rises on the soft spring (the focal moment of these screens); it only fades under reduced motion.
 */
export function AuthLayout({ children, homeTo = '/', showLanguages = true, note = true }: { children: ReactNode; homeTo?: string; showLanguages?: boolean; note?: boolean }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  return (
    <div className="auth">
      <SiteHeader homeTo={homeTo} showLanguages={showLanguages} />
      <main id="main" className="auth__main">
        <FaceMark className="auth__watermark" mood={4} />
        <motion.div className="auth__card" variants={enterVariants(reduced)} initial="hidden" animate="show">
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
