import type { ReactNode } from 'react'
import type { CharacterId } from './characters'

/*
 * Forty-eight funny characters: animals, heroes, plants and a few strange friends, drawn on a 64 × 64 grid. They share the circloo eyes (white rings with
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
  penguin: (
    <>
      <path d="M11 36 Q5 42 9 49 M53 36 Q59 42 55 49" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 40 Q12 11 32 10 Q52 11 50 40 Q50 57 32 57 Q14 57 14 40 Z" fill="#33415c" {...stroke} />
      <path d="M20 38 Q20 20 32 21 Q44 20 44 38 Q44 52 32 52 Q20 52 20 38 Z" fill="#fff" />
      <Eyes y={31} gap={7} r={4.6} />
      <path d="M28 38.5 H36 L32 44 Z" fill="#ff9f1c" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="22" cy="44" r="2.2" fill="#ff9aa2" />
      <circle cx="42" cy="44" r="2.2" fill="#ff9aa2" />
    </>
  ),
  lion: (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return <circle key={i} cx={32 + Math.cos(a) * 20} cy={35 + Math.sin(a) * 20} r="7.5" fill="#e8892b" {...stroke} />
      })}
      <circle cx="32" cy="35" r="20" fill="#e8892b" />
      <circle cx="22" cy="21" r="4.5" fill="#ffcf5c" {...stroke} />
      <circle cx="42" cy="21" r="4.5" fill="#ffcf5c" {...stroke} />
      <circle cx="32" cy="36" r="16" fill="#ffcf5c" {...stroke} />
      <Eyes y={33} gap={6.5} r={4.2} />
      <path d="M29 39.5 H35 L32 43 Z" fill="#8a4b22" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M28 45 Q32 48 36 45" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  koala: (
    <>
      <circle cx="13" cy="24" r="10" fill="#9aa5b1" {...stroke} />
      <circle cx="51" cy="24" r="10" fill="#9aa5b1" {...stroke} />
      <circle cx="13" cy="24" r="5" fill="#f1c7d4" />
      <circle cx="51" cy="24" r="5" fill="#f1c7d4" />
      <circle cx="32" cy="36" r="20" fill="#9aa5b1" {...stroke} />
      <Eyes y={32} gap={9} r={4.4} />
      <ellipse cx="32" cy="41" rx="4.6" ry="6" fill="#3b3b4f" />
      <path d="M29 49 Q32 51 35 49" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  hamster: (
    <>
      <circle cx="17" cy="18" r="6" fill="#f0b46a" {...stroke} />
      <circle cx="47" cy="18" r="6" fill="#f0b46a" {...stroke} />
      <circle cx="17" cy="18" r="2.8" fill="#ffb7c9" />
      <circle cx="47" cy="18" r="2.8" fill="#ffb7c9" />
      <circle cx="32" cy="36" r="21" fill="#f0b46a" {...stroke} />
      <ellipse cx="20" cy="42" rx="8" ry="7" fill="#fff4e3" />
      <ellipse cx="44" cy="42" rx="8" ry="7" fill="#fff4e3" />
      <Eyes y={31} gap={8} r={4.6} />
      <path d="M30 38 H34 L32 40.5 Z" fill="#ff8fab" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M32 40.5 V43 M29 45 Q32 43 35 45" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  whale: (
    <>
      <path d="M32 17 V9 M32 10 Q27 4 23 7 M32 10 Q37 4 41 7" fill="none" stroke="#4fb3c8" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M7 38 Q7 18 32 18 Q57 18 57 38 Q57 55 32 55 Q7 55 7 38 Z" fill="#4c8bf5" {...stroke} />
      <path d="M15 45 Q32 57 49 45 Q32 51 15 45 Z" fill="#cfe3ff" />
      <Eyes y={33} gap={10} r={4.6} />
      <Smile y={41} w={6} />
      <circle cx="16" cy="40" r="2.4" fill="#ff9aa2" />
      <circle cx="48" cy="40" r="2.4" fill="#ff9aa2" />
    </>
  ),
  hedgehog: (
    <>
      <path d="M8 42 L5 32 L11 29 L8 19 L17 19 L17 10 L25 14 L30 5 L35 13 L41 6 L44 15 L51 11 L50 21 L58 22 L53 30 L59 37 L55 43 Z" fill="#7a5238" {...stroke} />
      <ellipse cx="32" cy="40" rx="18" ry="15" fill="#f0d9b5" {...stroke} />
      <Eyes y={37} gap={7} r={4.2} />
      <circle cx="32" cy="45" r="2.6" fill={INK} />
      <path d="M29 49 Q32 51 35 49" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="20" cy="45" r="2" fill="#ff9aa2" />
      <circle cx="44" cy="45" r="2" fill="#ff9aa2" />
    </>
  ),
  monkey: (
    <>
      <circle cx="10" cy="34" r="7" fill="#8b5a3c" {...stroke} />
      <circle cx="54" cy="34" r="7" fill="#8b5a3c" {...stroke} />
      <circle cx="10" cy="34" r="3.5" fill="#f3c9a4" />
      <circle cx="54" cy="34" r="3.5" fill="#f3c9a4" />
      <circle cx="32" cy="34" r="21" fill="#8b5a3c" {...stroke} />
      <path d="M17 35 Q16 23 25 25 Q32 21 39 25 Q48 23 47 35 Q47 53 32 53 Q17 53 17 35 Z" fill="#f3c9a4" />
      <Eyes y={32} gap={6.5} r={4.6} />
      <circle cx="30" cy="40" r="1.2" fill={INK} />
      <circle cx="34" cy="40" r="1.2" fill={INK} />
      <Smile y={45} w={6} />
    </>
  ),
  bee: (
    <>
      <path d="M26 16 Q23 7 18 8 M38 16 Q41 7 46 8" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="18" cy="8" r="2.4" fill={INK} />
      <circle cx="46" cy="8" r="2.4" fill={INK} />
      <ellipse cx="12" cy="26" rx="8" ry="6" fill="#e6f4ff" {...stroke} transform="rotate(-25 12 26)" />
      <ellipse cx="52" cy="26" rx="8" ry="6" fill="#e6f4ff" {...stroke} transform="rotate(25 52 26)" />
      <circle cx="32" cy="36" r="20" fill="#ffcc33" {...stroke} />
      <path d="M14.5 44 Q32 50 49.5 44 L47 49.5 Q32 55 17 49.5 Z" fill={INK} />
      <Eyes y={31} gap={8} r={5} />
      <Smile y={39} w={5} />
    </>
  ),
  cactus: (
    <>
      <path d="M18 41 H13 Q9 41 9 37 V27 Q9 23 13 23 Q17 23 17 27 V34 H18" fill="#4caf6b" {...stroke} />
      <path d="M46 35 H48 V25 Q48 21 52 21 Q56 21 56 25 V34 Q56 39 51 39 H46" fill="#4caf6b" {...stroke} />
      <rect x="18" y="13" width="28" height="45" rx="14" fill="#4caf6b" {...stroke} />
      <circle cx="28" cy="11" r="3.6" fill="#ff7aa8" {...stroke} strokeWidth="1.6" />
      <circle cx="35" cy="10" r="3.6" fill="#ff7aa8" {...stroke} strokeWidth="1.6" />
      <Eyes y={30} gap={6} r={4.4} />
      <Smile y={39} w={5} />
      <path d="M22 47 l-2 1 M42 49 l2 1 M24 22 l-2 -1 M40 21 l2 -1" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  axolotl: (
    <>
      <path d="M14 27 Q6 20 3 24 M13 33 Q4 31 3 36 M14 39 Q7 43 8 47 M50 27 Q58 20 61 24 M51 33 Q60 31 61 36 M50 39 Q57 43 56 47" fill="none" stroke="#e0607e" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="32" cy="36" rx="20" ry="17" fill="#ffa3c4" {...stroke} />
      <Eyes y={33} gap={9} r={4.4} />
      <path d="M24 41 Q32 48 40 41" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="18" cy="40" r="2.4" fill="#ff6f91" />
      <circle cx="46" cy="40" r="2.4" fill="#ff6f91" />
    </>
  ),
  raccoon: (
    <>
      <path d="M12 12 L25 19 L13 28 Z" fill="#9aa0a6" {...stroke} />
      <path d="M52 12 L39 19 L51 28 Z" fill="#9aa0a6" {...stroke} />
      <circle cx="32" cy="36" r="21" fill="#9aa0a6" {...stroke} />
      <path d="M12 33 Q20 25 32 30 Q44 25 52 33 Q50 41 42 41 Q36 39 32 42 Q28 39 22 41 Q14 41 12 33 Z" fill="#2f3640" />
      <ellipse cx="32" cy="47" rx="9" ry="6" fill="#f5f5f5" />
      <Eyes y={33} gap={9} r={4.4} />
      <ellipse cx="32" cy="44" rx="3" ry="2.1" fill={INK} />
      <path d="M29 49 Q32 51 35 49" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  llama: (
    <>
      <ellipse cx="20" cy="13" rx="4" ry="9" fill="#f2e3c6" {...stroke} transform="rotate(-15 20 13)" />
      <ellipse cx="44" cy="13" rx="4" ry="9" fill="#f2e3c6" {...stroke} transform="rotate(15 44 13)" />
      <path d="M16 31 Q16 15 32 15 Q48 15 48 31 V45 Q48 57 32 57 Q16 57 16 45 Z" fill="#f2e3c6" {...stroke} />
      <path d="M21 18 Q23 11 27 14 Q30 8 33 13 Q37 8 40 14 Q44 12 43 19 Q32 15 21 18 Z" fill="#fff" {...stroke} strokeWidth="1.8" />
      <Eyes y={31} gap={7.5} r={4.4} />
      <ellipse cx="32" cy="45" rx="8.5" ry="6.5" fill="#e3c99a" />
      <path d="M29.5 42 v2 M34.5 42 v2" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M28 48 Q32 51 36 48" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  superhero: (
    <>
      <path d="M8 58 Q10 36 18 30 L46 30 Q54 36 56 58 Z" fill="#e5383b" {...stroke} />
      <circle cx="32" cy="32" r="19" fill="#f6cfa6" {...stroke} />
      <path d="M13 28 Q32 16 51 28 Q52 38 44 38 Q38 35 32 37 Q26 35 20 38 Q12 38 13 28 Z" fill="#2457c5" {...stroke} />
      <path d="M32 6 l2.2 4.6 5 .6 -3.7 3.4 1 5 -4.5 -2.5 -4.5 2.5 1 -5 -3.7 -3.4 5 -.6 Z" fill="#ffd23f" {...stroke} strokeWidth="1.6" />
      <Eyes y={30} gap={8} r={4.4} />
      <Smile y={44} w={5} />
    </>
  ),
  ninja: (
    <>
      <path d="M50 24 L61 20 M50 28 L60 33" stroke="#e5383b" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="32" cy="34" r="22" fill="#27364a" {...stroke} />
      <path d="M13 28 H51 V40 H13 Z" fill="#f6cfa6" {...stroke} strokeWidth="2" />
      <rect x="11" y="21" width="42" height="6" fill="#e5383b" {...stroke} strokeWidth="2" />
      <Eyes y={34} gap={8} r={4.4} />
      <path d="M26 47 Q32 50 38 47" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  knight: (
    <>
      <path d="M32 3 Q42 1 44 14 Q36 8 32 14 Q28 8 20 14 Q22 1 32 3 Z" fill="#e5383b" {...stroke} strokeWidth="1.8" />
      <path d="M12 56 V30 Q12 10 32 10 Q52 10 52 30 V56 Z" fill="#b9c2cc" {...stroke} />
      <rect x="14" y="26" width="36" height="14" rx="5" fill="#2f3b4a" {...stroke} />
      <Eyes y={33} gap={8} r={4.6} />
      <path d="M32 40 V56 M22 46 H42" stroke={INK} strokeWidth="1.8" />
      <path d="M26 50 Q32 53 38 50" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  wizard: (
    <>
      <path d="M32 2 L46 24 H18 Z" fill="#6a4fd1" {...stroke} />
      <ellipse cx="32" cy="25" rx="21" ry="5" fill="#6a4fd1" {...stroke} />
      <path d="M31 12 l1.6 3.4 3.6 .4 -2.7 2.5 .8 3.6 -3.3 -1.9 -3.3 1.9 .8 -3.6 -2.7 -2.5 3.6 -.4 Z" fill="#ffd23f" />
      <path d="M13 34 Q32 24 51 34 Q52 52 32 60 Q12 52 13 34 Z" fill="#f6cfa6" {...stroke} />
      <path d="M17 42 Q32 46 47 42 Q46 58 32 62 Q18 58 17 42 Z" fill="#f2f2f2" {...stroke} />
      <Eyes y={36} gap={8} r={4.4} />
      <ellipse cx="32" cy="43" rx="3.4" ry="2.2" fill="#e8b48c" {...stroke} strokeWidth="1.6" />
    </>
  ),
  pirate: (
    <>
      <circle cx="32" cy="36" r="21" fill="#f6cfa6" {...stroke} />
      <path d="M10 28 Q32 6 54 28 Q32 20 10 28 Z" fill="#e5383b" {...stroke} />
      <path d="M52 26 Q60 28 60 36" fill="none" stroke="#e5383b" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="26" cy="19" r="1.4" fill="#fff" /><circle cx="34" cy="16" r="1.4" fill="#fff" /><circle cx="42" cy="20" r="1.4" fill="#fff" />
      <Eyes y={35} gap={8} r={4.6} />
      <path d="M13 24 L45 44" stroke={INK} strokeWidth="2" />
      <ellipse cx="24" cy="35" rx="6.4" ry="5.6" fill={INK} />
      <path d="M24 46 Q32 52 40 46" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <rect x="38" y="46" width="2.6" height="3" fill="#fff" />
    </>
  ),
  astronaut: (
    <>
      <circle cx="32" cy="34" r="24" fill="#f4f6f8" {...stroke} />
      <ellipse cx="32" cy="34" rx="18" ry="15" fill="#223a5e" {...stroke} />
      <path d="M22 26 Q26 22 31 23" fill="none" stroke="#7aa7e0" strokeWidth="2.2" strokeLinecap="round" />
      <Eyes y={34} gap={7} r={4.2} />
      <Smile y={40} w={4} />
      <rect x="27" y="54" width="10" height="6" rx="2" fill="#e5383b" {...stroke} strokeWidth="1.8" />
      <circle cx="9" cy="34" r="3" fill="#e5383b" {...stroke} strokeWidth="1.8" />
      <circle cx="55" cy="34" r="3" fill="#e5383b" {...stroke} strokeWidth="1.8" />
    </>
  ),
  viking: (
    <>
      <path d="M13 22 Q4 18 5 8 Q12 12 17 18 Z M51 22 Q60 18 59 8 Q52 12 47 18 Z" fill="#f7f1e1" {...stroke} />
      <path d="M13 56 Q12 38 18 46 M51 56 Q52 38 46 46" fill="none" stroke="#e0883a" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="35" r="19" fill="#f6cfa6" {...stroke} />
      <path d="M12 28 Q12 10 32 10 Q52 10 52 28 Q32 21 12 28 Z" fill="#8c96a3" {...stroke} />
      <path d="M17 40 Q32 50 47 40 Q48 58 32 60 Q16 58 17 40 Z" fill="#e0883a" {...stroke} />
      <Eyes y={34} gap={8} r={4.4} />
      <Smile y={45} w={4} />
    </>
  ),
  detective: (
    <>
      <path d="M12 26 Q14 8 32 8 Q50 8 52 26 Z" fill="#a47148" {...stroke} />
      <path d="M8 27 Q32 22 56 27 Q56 32 50 31 Q32 28 14 31 Q8 32 8 27 Z" fill="#8a5a33" {...stroke} />
      <path d="M12 24 H52" stroke={INK} strokeWidth="2" />
      <path d="M13 31 H51 V40 Q51 56 32 58 Q13 56 13 40 Z" fill="#f6cfa6" {...stroke} />
      <Eyes y={38} gap={8} r={4.4} />
      <path d="M22 47 Q32 44 42 47 Q32 51 22 47 Z" fill="#6b4423" {...stroke} strokeWidth="1.8" />
      <circle cx="49" cy="46" r="6" fill="none" stroke={INK} strokeWidth="2.2" /><path d="M53 50 L59 56" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  sunflower: (
    <>
      {[0,30,60,90,120,150,180,210,240,270,300,330].map((a) => (
        <ellipse key={a} cx="32" cy="9" rx="5.4" ry="9" fill="#ffd23f" {...stroke} strokeWidth="1.8" transform={`rotate(${a} 32 33)`} />
      ))}
      <circle cx="32" cy="33" r="16" fill="#8a5a33" {...stroke} />
      <Eyes y={31} gap={7} r={4.4} />
      <Smile y={40} w={5} />
      <path d="M32 49 V62" stroke="#3f9a45" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  mushroom: (
    <>
      <path d="M22 36 H42 V50 Q42 58 32 58 Q22 58 22 50 Z" fill="#f7efe0" {...stroke} />
      <path d="M6 36 Q6 8 32 8 Q58 8 58 36 Q32 42 6 36 Z" fill="#e5383b" {...stroke} />
      <circle cx="19" cy="22" r="4.4" fill="#fff" /><circle cx="34" cy="16" r="3.6" fill="#fff" /><circle cx="46" cy="26" r="4.6" fill="#fff" />
      <Eyes y={46} gap={5} r={3.6} />
      <Smile y={53} w={3} />
    </>
  ),
  tulip: (
    <>
      <path d="M32 46 V62 M32 56 Q20 54 18 44 Q28 46 32 56 M32 58 Q44 56 46 46 Q36 48 32 58" fill="#3f9a45" stroke="#2c7a34" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 22 Q12 8 20 8 L26 18 L32 6 L38 18 L44 8 Q52 8 50 22 Q50 46 32 48 Q14 46 14 22 Z" fill="#ff6f91" {...stroke} />
      <Eyes y={30} gap={8} r={4.6} />
      <Smile y={39} w={5} />
      <circle cx="18" cy="38" r="2.4" fill="#ff3d6b" /><circle cx="46" cy="38" r="2.4" fill="#ff3d6b" />
    </>
  ),
  sprout: (
    <>
      <path d="M32 22 Q30 12 22 9 Q14 8 14 14 Q16 22 32 22 Z" fill="#6fcf6c" {...stroke} />
      <path d="M32 22 Q34 10 44 8 Q52 8 50 15 Q46 22 32 22 Z" fill="#4fb84e" {...stroke} />
      <circle cx="32" cy="39" r="19" fill="#8bd06a" {...stroke} />
      <Eyes y={37} gap={8} r={4.6} />
      <Smile y={46} w={5} />
      <circle cx="19" cy="44" r="2.4" fill="#ffb199" /><circle cx="45" cy="44" r="2.4" fill="#ffb199" />
    </>
  ),
  pumpkin: (
    <>
      <path d="M30 14 Q30 6 36 5" fill="none" stroke="#3f7a2c" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="19" cy="37" rx="13" ry="19" fill="#f08a24" {...stroke} />
      <ellipse cx="45" cy="37" rx="13" ry="19" fill="#f08a24" {...stroke} />
      <ellipse cx="32" cy="37" rx="12" ry="21" fill="#ff9d3a" {...stroke} />
      <Eyes y={34} gap={8} r={4.6} />
      <path d="M22 45 Q32 55 42 45" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  cherry: (
    <>
      <path d="M32 6 Q28 22 20 38 M32 6 Q40 22 46 40 M32 6 Q42 2 48 8" fill="none" stroke="#3f7a2c" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M32 6 Q44 0 52 10 Q42 14 32 6 Z" fill="#4fb84e" {...stroke} strokeWidth="1.8" />
      <circle cx="19" cy="44" r="14" fill="#d62246" {...stroke} />
      <circle cx="45" cy="46" r="13" fill="#e5383b" {...stroke} />
      <Eyes y={42} gap={5} r={3.6} />
      <Smile y={50} w={3.4} />
      <path d="M12 38 Q13 34 17 33" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </>
  ),
  pineapple: (
    <>
      <path d="M32 18 Q22 8 18 2 Q26 4 30 12 Q30 2 32 0 Q34 2 34 12 Q38 4 46 2 Q42 8 32 18 Z" fill="#4fb84e" {...stroke} strokeWidth="1.8" />
      <ellipse cx="32" cy="40" rx="17" ry="21" fill="#ffd23f" {...stroke} />
      <path d="M20 28 L44 52 M44 28 L20 52 M32 20 V60" stroke="#e0a800" strokeWidth="1.4" opacity="0.7" />
      <Eyes y={36} gap={7} r={4.4} />
      <Smile y={45} w={5} />
    </>
  ),
  tree: (
    <>
      <path d="M27 46 H37 L38 62 H26 Z" fill="#8a5a33" {...stroke} />
      <path d="M32 4 Q44 2 48 12 Q60 14 58 28 Q60 42 46 46 Q36 52 26 46 Q8 44 8 30 Q6 16 18 12 Q22 2 32 4 Z" fill="#4fb84e" {...stroke} />
      <circle cx="18" cy="22" r="2.2" fill="#e5383b" /><circle cx="48" cy="36" r="2.2" fill="#e5383b" />
      <Eyes y={27} gap={8} r={4.6} />
      <Smile y={37} w={5} />
    </>
  ),
  alien: (
    <>
      <path d="M22 12 Q18 4 12 4 M42 12 Q46 4 52 4" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="4" r="3" fill="#ffd23f" {...stroke} strokeWidth="1.8" /><circle cx="52" cy="4" r="3" fill="#ffd23f" {...stroke} strokeWidth="1.8" />
      <path d="M10 30 Q10 10 32 10 Q54 10 54 30 Q54 52 32 58 Q10 52 10 30 Z" fill="#8fe388" {...stroke} />
      <Eyes y={30} gap={10} r={7} />
      <path d="M28 47 Q32 50 36 47" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  unicorn: (
    <>
      <path d="M32 2 L37 20 H27 Z" fill="#ffd23f" {...stroke} />
      <path d="M26 14 L38 10 M27 20 L37 16" stroke="#e0a800" strokeWidth="1.4" />
      <path d="M14 14 L22 24 L12 28 Z M50 14 L42 24 L52 28 Z" fill="#fff" {...stroke} />
      <path d="M10 26 Q10 18 20 18 Q16 30 14 40 Q8 36 10 26 Z" fill="#ff8ab8" {...stroke} />
      <path d="M12 28 Q32 14 52 28 Q52 52 32 58 Q12 52 12 28 Z" fill="#fff" {...stroke} />
      <path d="M52 26 Q54 18 44 18 Q48 30 50 40 Q56 36 52 26 Z" fill="#8fd0ff" {...stroke} />
      <Eyes y={34} gap={8} r={4.4} />
      <ellipse cx="32" cy="48" rx="8" ry="5.4" fill="#ffd6e6" {...stroke} strokeWidth="1.8" />
      <circle cx="29.5" cy="47" r="1" fill={INK} /><circle cx="34.5" cy="47" r="1" fill={INK} />
    </>
  ),
  dragon: (
    <>
      <path d="M16 18 L12 6 L24 14 Z M48 18 L52 6 L40 14 Z" fill="#ffd23f" {...stroke} />
      <path d="M26 10 L32 2 L38 10 Z" fill="#2f8f4a" {...stroke} strokeWidth="1.8" />
      <path d="M10 34 Q10 12 32 12 Q54 12 54 34 Q54 54 32 58 Q10 54 10 34 Z" fill="#3fb95f" {...stroke} />
      <ellipse cx="32" cy="46" rx="13" ry="9" fill="#b6ecb0" {...stroke} />
      <circle cx="27" cy="45" r="1.8" fill={INK} /><circle cx="37" cy="45" r="1.8" fill={INK} />
      <Eyes y={30} gap={9} r={4.8} />
      <path d="M27 51 Q32 54 37 51" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  snowman: (
    <>
      <rect x="20" y="5" width="24" height="12" rx="2" fill="#2f3b4a" {...stroke} />
      <rect x="15" y="15" width="34" height="5" rx="2.5" fill="#2f3b4a" {...stroke} />
      <circle cx="32" cy="36" r="21" fill="#fff" {...stroke} />
      <Eyes y={32} gap={8} r={4.4} />
      <path d="M32 38 L47 41 L32 43 Z" fill="#f28c38" {...stroke} strokeWidth="1.8" />
      <path d="M16 50 Q32 58 48 50 L47 56 Q32 62 17 56 Z" fill="#e5383b" {...stroke} strokeWidth="1.8" />
    </>
  ),
  cloud: (
    <>
      <path d="M18 50 Q4 50 6 38 Q6 28 17 28 Q18 14 32 14 Q46 14 47 27 Q60 26 59 39 Q58 50 46 50 Z" fill="#dbeeff" {...stroke} />
      <Eyes y={33} gap={8} r={4.6} />
      <Smile y={43} w={5} />
      <circle cx="18" cy="42" r="2.6" fill="#ffb3c6" /><circle cx="46" cy="42" r="2.6" fill="#ffb3c6" />
      <path d="M22 56 l-2 5 M32 56 l-2 5 M42 56 l-2 5" stroke="#4fa0e8" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  sun: (
    <>
      {[0,45,90,135,180,225,270,315].map((a) => (
        <path key={a} d="M32 2 L37 12 H27 Z" fill="#ffb703" {...stroke} strokeWidth="1.8" transform={`rotate(${a} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="19" fill="#ffd23f" {...stroke} />
      <Eyes y={30} gap={7.5} r={4.4} />
      <Smile y={40} w={6} />
      <circle cx="19" cy="38" r="2.6" fill="#ff9a62" /><circle cx="45" cy="38" r="2.6" fill="#ff9a62" />
    </>
  ),
  moon: (
    <>
      <path d="M44 6 Q24 4 14 20 Q4 38 18 52 Q34 64 52 52 Q38 54 30 42 Q22 28 34 16 Q38 10 44 6 Z" fill="#ffe08a" {...stroke} />
      <circle cx="30" cy="30" r="2.6" fill="#f0c860" /><circle cx="26" cy="43" r="3.2" fill="#f0c860" />
      <circle cx="26" cy="33" r="4.6" fill="#fff" stroke={INK} strokeWidth="2.2" /><circle cx="26" cy="33.6" r="1.9" fill={INK} />
      <path d="M17 41 Q22 46 28 45" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M50 12 l1.4 3 3.2 .4 -2.4 2.2 .6 3.2 -2.8 -1.6 -2.8 1.6 .6 -3.2 -2.4 -2.2 3.2 -.4 Z" fill="#fff" {...stroke} strokeWidth="1.4" />
    </>
  ),
  star: (
    <>
      <path d="M32 4 L40 22 L60 24 L45 37 L50 57 L32 46 L14 57 L19 37 L4 24 L24 22 Z" fill="#ffd23f" {...stroke} />
      <Eyes y={33} gap={7} r={4.2} />
      <Smile y={42} w={4.6} />
      <circle cx="21" cy="40" r="2.2" fill="#ff9a62" /><circle cx="43" cy="40" r="2.2" fill="#ff9a62" />
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
