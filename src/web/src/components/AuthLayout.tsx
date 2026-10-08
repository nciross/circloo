import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { Lock } from 'lucide-react'
import { SiteHeader } from './SiteHeader'
import { Character } from './Character'
import type { CharacterId } from './characters'
import { enterVariants, useReducedMotion } from '../lib/motion'

/* Two organic shapes for the pictures beside the card (the landing's blobs, still). */
const BLOB_A = 'M30 72 C 38 22 120 2 172 20 C 226 40 240 112 206 158 C 174 200 86 200 48 172 C 8 142 22 104 30 72 Z'
const BLOB_B = 'M44 40 C 90 6 176 4 210 48 C 240 90 226 160 176 182 C 124 204 48 190 24 142 C 2 98 8 66 44 40 Z'

function Side({ end }: { end?: boolean }) {
  const cast: CharacterId[] = end ? ['owl', 'frog'] : ['panda', 'bunny']
  return (
    <div className={`auth__side auth__side--${end ? 'end' : 'start'}`} aria-hidden="true">
      <svg className="auth__blob" viewBox="0 0 236 196" focusable="false">
        <path d={end ? BLOB_B : BLOB_A} fill={end ? 'var(--lavender)' : 'var(--mint)'} />
      </svg>
      <span className="auth__cast">
        {cast.map((c) => <Character key={c} id={c} tag={false} className="auth__char" />)}
      </span>
      <svg className="auth__doodle" viewBox="0 0 24 24" focusable="false">
        <path d="M12 0 C 13 8 16 11 24 12 C 16 13 13 16 12 24 C 11 16 8 13 0 12 C 8 11 11 8 12 0 Z" fill={end ? 'var(--peach)' : 'var(--butter)'} />
      </svg>
    </div>
  )
}

/**
 * Sign-in, first-run, join and not-found screens, in the public site's language (#250): the light mauve bar with the
 * site's wordmark, then one white card with 32px corners and soft pastel corners, flanked on wide screens by two still
 * pictures of the cast. The card rises on the soft spring, on transform only (axe reads it on arrival).
 * `plain` drops the card for pages that are a headline and a character rather than a form (404).
 * `action` is the bar's one call at the end (the join page's Log in for visitors).
 */
export function AuthLayout({ children, homeTo = '/', showLanguages = true, note = true, plain = false, action }: {
  children: ReactNode
  homeTo?: string
  showLanguages?: boolean
  note?: boolean
  plain?: boolean
  action?: ReactNode
}) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  return (
    <div className="auth">
      <SiteHeader homeTo={homeTo} showLanguages={showLanguages} tone="mauve">{action}</SiteHeader>
      <main id="main" className="auth__main">
        <Side />
        <Side end />
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
