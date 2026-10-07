/** The five body colours (tokens --body-1…5), so an avatar is a body like any other on a ring. */
const TONES = 5

/** Initials on a colour picked from the name, so a person keeps the same colour everywhere. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const clean = name.trim()
  const initials = clean
    .split(/\s+/)
    .map((part) => [...part][0] ?? '')
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase()
  let hash = 0
  for (const ch of clean) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  return (
    <span className={`avatar avatar--${size} avatar--t${hash % TONES}`} aria-hidden="true">
      {initials || '·'}
    </span>
  )
}
