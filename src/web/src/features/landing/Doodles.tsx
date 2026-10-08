/*
 * The site's doodles (#250): small hand-drawn marks in pastels, drawn in code. All decorative, all `aria-hidden`.
 * Colours are the pastel tokens; the marks never carry meaning.
 */
type Props = { className?: string }

/** A loose wave. */
export function Squiggle({ className }: Props) {
  return (
    <svg className={['doodle', className].filter(Boolean).join(' ')} viewBox="0 0 80 40" aria-hidden="true" focusable="false">
      <path d="M3 30 C 14 2 26 2 38 30 S 62 58 77 10" fill="none" stroke="var(--lavender)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

/** A four-point star. */
export function Star({ className, tone = 'butter' }: Props & { tone?: 'butter' | 'peach' | 'mint' | 'sky-pastel' | 'lavender' }) {
  return (
    <svg className={['doodle', className].filter(Boolean).join(' ')} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 0 C 13 8 16 11 24 12 C 16 13 13 16 12 24 C 11 16 8 13 0 12 C 8 11 11 8 12 0 Z" fill={`var(--${tone})`} />
    </svg>
  )
}

/** A pair of beamed notes. */
export function MusicNote({ className }: Props) {
  return (
    <svg className={['doodle', className].filter(Boolean).join(' ')} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M11 26 V7 L27 3 V22" fill="none" stroke="var(--peach)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="26" r="4.5" fill="var(--peach)" />
      <circle cx="23" cy="22" r="4.5" fill="var(--peach)" />
    </svg>
  )
}

/** A curled line, like a thread. */
export function Loop({ className }: Props) {
  return (
    <svg className={['doodle', className].filter(Boolean).join(' ')} viewBox="0 0 80 50" aria-hidden="true" focusable="false">
      <path d="M3 4 C 30 44 52 44 52 24 C 52 2 20 10 30 32 C 40 52 68 44 77 12" fill="none" stroke="var(--sky-pastel)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** A big opening quotation mark for the language cards. */
export function QuoteMark({ className }: Props) {
  return (
    <svg className={['doodle', className].filter(Boolean).join(' ')} viewBox="0 0 48 40" aria-hidden="true" focusable="false">
      <path d="M4 40 V24 C 4 12 10 4 22 2 L 24 8 C 17 10 14 14 14 20 H 22 V 40 Z M28 40 V24 C 28 12 34 4 46 2 L 48 8 C 41 10 38 14 38 20 H 46 V 40 Z" fill="var(--on-field)" />
    </svg>
  )
}

/** The small motif in a round card's corner: a ring and three dots. */
export function Motif({ className }: Props) {
  return (
    <svg className={['doodle', className].filter(Boolean).join(' ')} viewBox="0 0 40 24" aria-hidden="true" focusable="false">
      <circle cx="9" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="24" cy="12" r="2.5" fill="currentColor" />
      <circle cx="31" cy="6" r="2" fill="currentColor" />
      <circle cx="33" cy="18" r="2" fill="currentColor" />
    </svg>
  )
}
