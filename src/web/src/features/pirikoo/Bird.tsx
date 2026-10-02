/*
 * Pirikoo, the parakeet guide. It faces front like the rest of the cast and has the logo's eyes.
 * Wings, head, crest and jaw are separate groups, so CSS can flap, tilt, bob and "talk" each one.
 * The mood shows what the AI is doing, the way a person would: listening while you write, thinking before
 * it answers, beak moving while the words stream in, a hop when it is done. Decorative.
 */
const INK = '#0f2537'

export type BirdMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'oops'

export function Bird({ className, mood }: { className?: string; mood?: BirdMood }) {
  return (
    <svg className={['pk', mood ? `pk--${mood}` : null, className].filter(Boolean).join(' ')} viewBox="0 0 64 72" aria-hidden="true" focusable="false">
      <g className="pk__all">
        <path className="pk__tail" d="M27 58 L24 71 L32 64 L40 71 L37 58 Z" fill="#2f9be0" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <g className="pk__wing pk__wing--l">
          <path d="M14 34 C4 36 2 48 8 56 C12 52 16 46 18 40 Z" fill="#2fa860" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M8 46 L13 44 M9 51 L14 48" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
        </g>
        <g className="pk__wing pk__wing--r">
          <path d="M50 34 C60 36 62 48 56 56 C52 52 48 46 46 40 Z" fill="#2fa860" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M56 46 L51 44 M55 51 L50 48" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
        </g>
        <path className="pk__body" d="M32 24 C46 24 50 38 48 48 C46 58 40 62 32 62 C24 62 18 58 16 48 C14 38 18 24 32 24 Z" fill="#3fbf6e" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M32 40 C40 40 42 50 38 56 C35 59 29 59 26 56 C22 50 24 40 32 40 Z" fill="#c9f2a8" />
        <path className="pk__feet" d="M27 62 L25 66 M29 62 L29 66 M35 62 L35 66 M37 62 L39 66" stroke="#f08a24" strokeWidth="2.2" strokeLinecap="round" />
        <g className="pk__head">
          <path className="pk__crest" d="M30 8 C29 3 33 1 34 5 C36 1 40 3 38 8" fill="#ef4a32" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="32" cy="22" r="15" fill="#3fbf6e" stroke={INK} strokeWidth="2.4" />
          <path d="M20 24 C20 15 26 11 32 11 C38 11 44 15 44 24 C40 21 24 21 20 24 Z" fill="#ffe066" />
          <g className="pk__eyes">
            {[26, 38].map((x) => (
              <g key={x} className="pk__eye">
                <circle cx={x} cy={21} r="4.4" fill="#fff" stroke={INK} strokeWidth="2" />
                <circle className="pk__pupil" cx={x} cy={21.6} r="1.9" fill={INK} />
              </g>
            ))}
          </g>
          <g className="pk__beak">
            <ellipse className="pk__mouth" cx="32" cy="29.9" rx="1.7" ry="1.3" fill="#7a2416" />
            <path className="pk__jaw" d="M30.2 28.8 C31.2 29.4 32.8 29.4 33.8 28.8 C33.4 30.6 32.6 32 32 33 C31.4 32 30.6 30.6 30.2 28.8 Z" fill="#f08a24" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
            <path className="pk__bill" d="M29 27 C29 25 35 25 35 27 C35 28.6 33.6 29.5 32 29.5 C30.4 29.5 29 28.6 29 27 Z" fill="#ff9f1c" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
          </g>
          <circle cx="21" cy="28" r="2" fill="#ff9aa2" opacity="0.8" />
          <circle cx="43" cy="28" r="2" fill="#ff9aa2" opacity="0.8" />
        </g>
      </g>
    </svg>
  )
}
