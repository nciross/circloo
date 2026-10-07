import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { LOCALES, type Locale } from '../i18n'
import { useUiStore } from '../stores/ui'
import { useChangeLocale } from '../app/locale'
import { useReducedMotion } from '../lib/motion'
import { popoverMotion, usePopover } from './usePopover'

/**
 * The language dropdown. Each language is named in its own language and applies only when chosen,
 * so browsing the list never flips the page (WCAG 3.2.2). Defaults to the browser language.
 */
export function LanguageMenu({
  value,
  onChange,
  labelledBy,
  align = 'end',
  className,
}: {
  value?: Locale
  onChange?: (l: Locale) => void
  /** Id of a visible label (forms); the trigger then reads "label + current language". */
  labelledBy?: string
  align?: 'start' | 'end'
  className?: string
}) {
  const { t } = useTranslation()
  const current = useUiStore((s) => s.locale)
  const change = useChangeLocale()
  const reduced = useReducedMotion()
  const selected = value ?? current
  const pick = onChange ?? change
  const { open: menuOpen, toggle, close, triggerRef, panelRef, panelProps } = usePopover()
  const id = useId()
  const name = (l: Locale) => t(`common.languages.${l}`)

  return (
    <div className={['dropdown', 'lang-menu', className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown__trigger lang-menu__trigger"
        aria-expanded={menuOpen}
        aria-controls={id}
        aria-label={labelledBy ? undefined : t('common.languageCurrent', { name: name(selected) })}
        aria-labelledby={labelledBy ? `${labelledBy} ${id}-value` : undefined}
        onClick={toggle}
      >
        <Globe size={16} aria-hidden="true" />
        <span id={`${id}-value`} lang={selected}>{name(selected)}</span>
        <ChevronDown className="dropdown__chevron" size={14} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            ref={panelRef}
            id={id}
            className={`dropdown__panel dropdown__panel--${align}`}
            data-motion=""
            {...popoverMotion(reduced)}
            {...panelProps}
          >
            <ul className="dropdown__list">
              {LOCALES.map((l) => (
                <li key={l}>
                  <button
                    type="button"
                    className="dropdown__item"
                    lang={l}
                    aria-current={l === selected ? 'true' : undefined}
                    onClick={() => {
                      pick(l)
                      close()
                    }}
                  >
                    <span className="dropdown__item-text">{name(l)}</span>
                    {l === selected ? <Check size={16} aria-hidden="true" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
