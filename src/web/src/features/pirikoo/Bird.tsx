/*
 * Pirikoo, the parakeet guide (#250, redrawn): a flat, geometric mark in the charcoal app's language. No outlines, a
 * few clean shapes in a calm green, a butter face mask, the circloo logo's ring eyes in charcoal, a compact hooked
 * beak, and a small cerise crest as the one accent. Wings, head, crest and jaw stay separate groups, so CSS can flap,
 * tilt, bob and "talk" each one (pirikoo.css anchors them on their own boxes). Decorative.
 * The mood shows what the AI is doing, the way a person would: listening while you write, thinking before it answers,
 * beak moving while the words stream in, a hop when it is done.
 */
const INK = '#2e2e36'
const GREEN = '#1fa971'
const GREEN_DEEP = '#13804f'
const BELLY = '#c6eedb'
const MASK = '#f7d873'
const BEAK = '#f39a4c'
const BEAK_DEEP = '#d9762a'
const CREST = '#d12a6c'

export type BirdMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'oops'

export function Bird({ className, mood }: { className?: string; mood?: BirdMood }) {
  return (
    <svg className={['pk', mood ? `pk--${mood}` : null, className].filter(Boolean).join(' ')} viewBox="0 0 64 72" aria-hidden="true" focusable="false">
      <g className="pk__all">
        {/* Two long tail feathers. */}
        <path className="pk__tail" d="M28.5 56 L25.5 70.5 Q27.5 71.5 29.5 70 L32 59 L34.5 70 Q36.5 71.5 38.5 70.5 L35.5 56 Z" fill={GREEN_DEEP} />
        {/* Wings: leaf shapes behind the body, hinged at the shoulders. */}
        <g className="pk__wing pk__wing--l">
          <path d="M19 33 Q6 37 7.5 50 Q8.5 56 13 57.5 Q17 50 20.5 42 Z" fill={GREEN_DEEP} />
        </g>
        <g className="pk__wing pk__wing--r">
          <path d="M45 33 Q58 37 56.5 50 Q55.5 56 51 57.5 Q47 50 43.5 42 Z" fill={GREEN_DEEP} />
        </g>
        {/* Body and belly: one smooth egg, a lighter oval. */}
        <path className="pk__body" d="M32 25 Q48.5 25 48.5 44 Q48.5 61 32 61 Q15.5 61 15.5 44 Q15.5 25 32 25 Z" fill={GREEN} />
        <ellipse cx="32" cy="48" rx="9.5" ry="11" fill={BELLY} />
        <path className="pk__feet" d="M27.5 61 L27.5 65 M36.5 61 L36.5 65" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
        <g className="pk__head">
          {/* Crest: three short feathers, the one cerise accent. */}
          <path className="pk__crest" d="M28.5 9.5 Q27 3.5 30.5 3 Q31.5 6 32 8 Q32.5 3 35.5 3.2 Q36 6.5 35 9.5 Q38 6 40.5 7.5 Q39.5 10.5 36.5 11.5 Z" fill={CREST} />
          <circle cx="32" cy="22" r="15" fill={GREEN} />
          {/* The face mask: a butter half-moon under the eyes, as on a budgie. */}
          <path d="M18.5 25 Q19.5 35.5 32 36.5 Q44.5 35.5 45.5 25 Q39 28.5 32 28.5 Q25 28.5 18.5 25 Z" fill={MASK} />
          <g className="pk__eyes">
            {[25.5, 38.5].map((x) => (
              <g key={x} className="pk__eye">
                <circle cx={x} cy={20.5} r="4.6" fill="#ffffff" stroke={INK} strokeWidth="2.4" />
                <circle className="pk__pupil" cx={x} cy={21} r="1.9" fill={INK} />
              </g>
            ))}
          </g>
          <g className="pk__beak">
            <ellipse className="pk__mouth" cx="32" cy="30.2" rx="1.6" ry="1.2" fill="#7a2416" />
            <path className="pk__jaw" d="M29.6 29.4 Q32 30.4 34.4 29.4 Q33.6 32.4 32 33.4 Q30.4 32.4 29.6 29.4 Z" fill={BEAK_DEEP} />
            <path className="pk__bill" d="M28.4 26.6 Q32 24.4 35.6 26.6 Q35.4 29.6 32 31 Q28.6 29.6 28.4 26.6 Z" fill={BEAK} />
          </g>
        </g>
      </g>
    </svg>
  )
}
