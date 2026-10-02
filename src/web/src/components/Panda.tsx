/*
 * circloo's thinking panda: a single-weight line drawing that draws itself, again and again, while circloo
 * writes. The eyes are the logo's eyes. Static (fully drawn) under reduced motion. Decorative: the
 * "circloo is thinking" text next to it carries the meaning.
 */
export function Panda({ thinking = false, className }: { thinking?: boolean; className?: string }) {
  return (
    <svg
      className={['panda', thinking ? 'is-thinking' : '', className].filter(Boolean).join(' ')}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className="panda__lines" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path className="panda__ear" pathLength={1} d="M14.5 21.5 A7 7 0 1 1 22.5 13.6" />
        <path className="panda__ear" pathLength={1} d="M41.5 13.6 A7 7 0 1 1 49.5 21.5" />
        <path className="panda__head" pathLength={1} d="M32 13 C46 13 54 22 54 35 C54 48 44 56 32 56 C20 56 10 48 10 35 C10 22 18 13 32 13 Z" />
        <path className="panda__patch" pathLength={1} d="M18.5 30 C20 24 27 23 28.5 29 C30 35 26 40 22 39.5 C18 39 17.5 34 18.5 30 Z" />
        <path className="panda__patch" pathLength={1} d="M45.5 30 C44 24 37 23 35.5 29 C34 35 38 40 42 39.5 C46 39 46.5 34 45.5 30 Z" />
        <circle className="panda__eye" pathLength={1} cx="23.5" cy="31.5" r="3.2" />
        <circle className="panda__eye" pathLength={1} cx="40.5" cy="31.5" r="3.2" />
        <path className="panda__nose" pathLength={1} d="M29.5 42 Q32 44.5 34.5 42" />
        <path className="panda__mouth" pathLength={1} d="M27 47 Q32 51 37 47" />
      </g>
      <circle className="panda__pupil" cx="23.5" cy="32" r="1.3" />
      <circle className="panda__pupil" cx="40.5" cy="32" r="1.3" />
    </svg>
  )
}
