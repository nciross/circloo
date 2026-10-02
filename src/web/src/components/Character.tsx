import type { ReactNode } from 'react'
import type { CharacterId } from './characters'

/*
 * Twelve funny characters drawn on a 64 × 64 grid. They share the circloo eyes (white rings with
 * a pupil) so the whole cast reads as one family with the logo. Colours are fixed in both themes:
 * a character is a person's identity, not chrome. Outlines use the brand navy.
 */
const INK = '#0f2537'

function Eyes({ y = 32, gap = 8, r = 5.5 }: { y?: number; gap?: number; r?: number }) {
  return (
    <g className="char__eyes">
      {[32 - gap, 32 + gap].map((x) => (
        <g key={x} className="char__eye">
          <circle cx={x} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth="2.2" />
          <circle className="char__pupil" cx={x} cy={y + 0.6} r={r * 0.42} fill={INK} />
        </g>
      ))}
    </g>
  )
}

const Smile = ({ y = 42, w = 6 }: { y?: number; w?: number }) => (
  <path d={`M${32 - w} ${y} Q32 ${y + w * 0.8} ${32 + w} ${y}`} fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
)

const stroke = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' as const }

const ART: Record<CharacterId, ReactNode> = {
  panda: (
    <>
      <circle cx="15" cy="17" r="7.5" fill={INK} />
      <circle cx="49" cy="17" r="7.5" fill={INK} />
      <circle cx="32" cy="35" r="22" fill="#fff" {...stroke} />
      <ellipse cx="23.5" cy="32.5" rx="7.5" ry="9" fill={INK} transform="rotate(-25 23.5 32.5)" />
      <ellipse cx="40.5" cy="32.5" rx="7.5" ry="9" fill={INK} transform="rotate(25 40.5 32.5)" />
      <Eyes y={32} gap={8.5} r={4.6} />
      <ellipse cx="32" cy="41" rx="3.2" ry="2.2" fill={INK} />
      <path d="M28 45 Q32 48 36 45" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  fox: (
    <>
      <path d="M12 10 L24 22 L14 28 Z" fill="#f28c38" {...stroke} />
      <path d="M52 10 L40 22 L50 28 Z" fill="#f28c38" {...stroke} />
      <path d="M10 26 Q32 12 54 26 Q54 46 32 56 Q10 46 10 26 Z" fill="#f28c38" {...stroke} />
      <path d="M14 34 Q24 40 32 56 Q40 40 50 34 Q44 48 32 56 Q20 48 14 34 Z" fill="#fff" />
      <Eyes y={31} gap={9} r={4.8} />
      <ellipse cx="32" cy="45" rx="3" ry="2.2" fill={INK} />
    </>
  ),
  frog: (
    <>
      <circle cx="21" cy="20" r="9" fill="#5cbf5a" {...stroke} />
      <circle cx="43" cy="20" r="9" fill="#5cbf5a" {...stroke} />
      <ellipse cx="32" cy="38" rx="25" ry="18" fill="#5cbf5a" {...stroke} />
      <Eyes y={19} gap={11} r={5.4} />
      <path d="M17 39 Q32 52 47 39" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="34" r="2.6" fill="#ff9aa2" />
      <circle cx="48" cy="34" r="2.6" fill="#ff9aa2" />
    </>
  ),
  cat: (
    <>
      <path d="M12 12 L24 20 L12 30 Z" fill="#8e7cc3" {...stroke} />
      <path d="M52 12 L40 20 L52 30 Z" fill="#8e7cc3" {...stroke} />
      <circle cx="32" cy="36" r="21" fill="#8e7cc3" {...stroke} />
      <Eyes y={33} gap={8} r={5} />
      <path d="M30 40 L32 42 L34 40 Z" fill="#ff9aa2" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M28 44 Q30 46 32 44 Q34 46 36 44" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 38 H20 M10 43 L20 41 M54 38 H44 M54 43 L44 41" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  owl: (
    <>
      <path d="M13 14 L22 22 M51 14 L42 22" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 26 Q12 10 32 14 Q52 10 52 26 L52 42 Q52 56 32 56 Q12 56 12 42 Z" fill="#a8774f" {...stroke} />
      <path d="M20 44 Q32 58 44 44 Q32 52 20 44 Z" fill="#e9cfa8" />
      <circle cx="23" cy="30" r="9" fill="#e9cfa8" />
      <circle cx="41" cy="30" r="9" fill="#e9cfa8" />
      <Eyes y={30} gap={9} r={6} />
      <path d="M29 38 L32 44 L35 38 Z" fill="#ffb03a" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
    </>
  ),
  octopus: (
    <>
      <path d="M12 44 Q14 56 20 50 Q24 58 28 50 Q32 58 36 50 Q40 58 44 50 Q50 56 52 44" fill="#ff7aa8" {...stroke} />
      <path d="M12 44 Q8 12 32 10 Q56 12 52 44 Z" fill="#ff7aa8" {...stroke} />
      <Eyes y={30} gap={8.5} r={5.4} />
      <Smile y={39} w={5} />
      <circle cx="18" cy="22" r="2" fill="#fff" opacity="0.7" />
    </>
  ),
  bear: (
    <>
      <circle cx="15" cy="17" r="7.5" fill="#b5793f" {...stroke} />
      <circle cx="49" cy="17" r="7.5" fill="#b5793f" {...stroke} />
      <circle cx="15" cy="17" r="3.4" fill="#e3b583" />
      <circle cx="49" cy="17" r="3.4" fill="#e3b583" />
      <circle cx="32" cy="35" r="22" fill="#b5793f" {...stroke} />
      <ellipse cx="32" cy="43" rx="9.5" ry="7.5" fill="#e3b583" />
      <Eyes y={31} gap={8.5} r={4.8} />
      <ellipse cx="32" cy="40" rx="3.2" ry="2.3" fill={INK} />
      <path d="M29 45 Q32 47.5 35 45" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  bunny: (
    <>
      <ellipse cx="23" cy="13" rx="5.5" ry="12" fill="#f4ece4" {...stroke} />
      <ellipse cx="41" cy="13" rx="5.5" ry="12" fill="#f4ece4" {...stroke} />
      <ellipse cx="23" cy="13" rx="2.4" ry="8" fill="#ffb7c9" />
      <ellipse cx="41" cy="13" rx="2.4" ry="8" fill="#ffb7c9" />
      <circle cx="32" cy="38" r="20" fill="#f4ece4" {...stroke} />
      <Eyes y={35} gap={8} r={4.8} />
      <path d="M30 42 L32 44 L34 42 Z" fill="#ff8fab" />
      <path d="M32 44 V47 M29 49 Q32 47 35 49" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="19" cy="43" r="2.6" fill="#ffb7c9" />
      <circle cx="45" cy="43" r="2.6" fill="#ffb7c9" />
    </>
  ),
  robot: (
    <>
      <path d="M32 8 V15" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="32" cy="7" r="3.4" fill="#ef4a32" stroke={INK} strokeWidth="2" />
      <rect x="10" y="15" width="44" height="38" rx="10" fill="#4fb3c8" {...stroke} />
      <rect x="6" y="28" width="5" height="12" rx="2" fill="#4fb3c8" {...stroke} />
      <rect x="53" y="28" width="5" height="12" rx="2" fill="#4fb3c8" {...stroke} />
      <Eyes y={31} gap={9} r={5.6} />
      <rect x="23" y="42" width="18" height="5" rx="2.5" fill="#fff" stroke={INK} strokeWidth="2" />
      <path d="M29 42 V47 M35 42 V47" stroke={INK} strokeWidth="1.6" />
    </>
  ),
  ghost: (
    <>
      <path d="M12 54 V30 Q12 10 32 10 Q52 10 52 30 V54 Q47 49 42 54 Q37 59 32 54 Q27 49 22 54 Q17 59 12 54 Z" fill="#ece7ff" {...stroke} />
      <Eyes y={29} gap={8} r={5.2} />
      <ellipse cx="32" cy="41" rx="3.6" ry="4.4" fill={INK} />
      <circle cx="18" cy="36" r="2.4" fill="#c8b8ff" />
      <circle cx="46" cy="36" r="2.4" fill="#c8b8ff" />
    </>
  ),
  chick: (
    <>
      <path d="M28 12 Q30 4 33 11 Q36 5 36 13" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="32" cy="35" r="22" fill="#ffd23f" {...stroke} />
      <path d="M10 38 Q4 32 9 28 M54 38 Q60 32 55 28" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <Eyes y={31} gap={8.5} r={5} />
      <path d="M26 40 L32 46 L38 40 Q32 37 26 40 Z" fill="#ff8a3d" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  dino: (
    <>
      <path d="M16 18 L20 9 L25 16 L30 7 L35 15 L41 8 L44 18" fill="#3e9d6b" {...stroke} />
      <path d="M10 34 Q10 14 32 14 Q54 14 54 34 L54 40 Q54 56 32 56 Q10 56 10 40 Z" fill="#7bc96f" {...stroke} />
      <Eyes y={30} gap={9} r={5.2} />
      <path d="M18 43 Q32 51 46 43" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M24 45 L26 48 L28 46 M36 46 L38 48 L40 45" fill="#fff" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="20" cy="22" r="1.6" fill="#3e9d6b" />
      <circle cx="44" cy="22" r="1.6" fill="#3e9d6b" />
    </>
  ),
}

/** One character. Decorative unless `title` is given (then it is an image with that name). */
export function Character({ id, className, title }: { id: CharacterId; className?: string; title?: string }) {
  return (
    <svg
      className={['char', `char--${id}`, className].filter(Boolean).join(' ')}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      {ART[id]}
    </svg>
  )
}
