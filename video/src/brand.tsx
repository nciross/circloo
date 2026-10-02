import { loadFont } from '@remotion/google-fonts/ReadexPro'
import { interpolate } from 'remotion'
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'

/** Story clips on the landing page sit next to their own text, so they turn the captions off. */
export const Captions = createContext(true)

export const { fontFamily } = loadFont('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'arabic'] })

export const INK = '#0f2537'
export const SUBTLE = '#45576a'
export const CANVAS = '#f5f7f9'
export const BLUE = '#0d5bd7'
export const VIOLET = '#6a4fd1'
export const CORAL = '#ef4a32'
export const GREEN = '#1c7c52'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** The logo face: two "o" eyes and a coral mouth. `smile` 0 = flat, 1 = big grin; `draw` reveals the mouth. */
export function Face({ size, smile = 1, draw = 1, eyes = 1, look = 0 }: { size: number; smile?: number; draw?: number; eyes?: number; look?: number }) {
  const lift = 44 + smile * 7
  return (
    <svg width={size} height={(size * 47) / 57} viewBox="1 9 57 47" fill="none">
      {[15.25, 43.75].map((x) => (
        <g key={x} style={{ scale: eyes, transformOrigin: `${x}px 23.75px`, transformBox: 'view-box' }}>
          <circle cx={x} cy={23.75} r={11} stroke={INK} strokeWidth={4.6} />
          <circle cx={x + look * 3.5} cy={24.25} r={3.4} fill={INK} />
        </g>
      ))}
      <path
        d={`M16 42 Q22 ${lift} 29.5 ${lift} Q37 ${lift} 43 42`}
        stroke={CORAL}
        strokeWidth={4.2}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />
    </svg>
  )
}

/** circloo's line panda, drawn by `progress` (0 → 1). */
export function Panda({ size, progress }: { size: number; progress: number }) {
  const d = (from: number) => 1 - interpolate(progress, [from, from + 0.45], [0, 1], clamp)
  const line = { stroke: INK, strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none', pathLength: 1, strokeDasharray: 1 } as const
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <path {...line} strokeDashoffset={d(0)} d="M32 13 C46 13 54 22 54 35 C54 48 44 56 32 56 C20 56 10 48 10 35 C10 22 18 13 32 13 Z" />
      <path {...line} strokeDashoffset={d(0.1)} d="M14.5 21.5 A7 7 0 1 1 22.5 13.6" />
      <path {...line} strokeDashoffset={d(0.1)} d="M41.5 13.6 A7 7 0 1 1 49.5 21.5" />
      <path {...line} strokeDashoffset={d(0.25)} d="M18.5 30 C20 24 27 23 28.5 29 C30 35 26 40 22 39.5 C18 39 17.5 34 18.5 30 Z" />
      <path {...line} strokeDashoffset={d(0.25)} d="M45.5 30 C44 24 37 23 35.5 29 C34 35 38 40 42 39.5 C46 39 46.5 34 45.5 30 Z" />
      <circle {...line} strokeDashoffset={d(0.4)} cx="23.5" cy="31.5" r="3.2" />
      <circle {...line} strokeDashoffset={d(0.4)} cx="40.5" cy="31.5" r="3.2" />
      <path {...line} strokeDashoffset={d(0.5)} d="M27 47 Q32 51 37 47" />
    </svg>
  )
}

/** A full-frame canvas with the brand font, direction and a caption line at the bottom. */
export function Frame({ dir, caption, captionOpacity = 1, children }: { dir: 'ltr' | 'rtl'; caption?: string; captionOpacity?: number; children: ReactNode }) {
  const captions = useContext(Captions)
  if (!captions) caption = undefined
  return (
    <div dir={dir} style={{ position: 'absolute', inset: 0, background: CANVAS, fontFamily, color: INK, overflow: 'hidden' }}>
      {children}
      {caption ? (
        <div style={{ position: 'absolute', insetInline: 80, bottom: 48, textAlign: 'center', fontSize: 40, fontWeight: 600, letterSpacing: dir === 'rtl' ? 0 : '-0.01em', opacity: captionOpacity }}>
          {caption}
        </div>
      ) : null}
    </div>
  )
}

export const card: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #dfe3e8',
  borderRadius: 16,
  boxShadow: '0 24px 48px -12px rgb(15 37 55 / 0.25), 0 0 1px rgb(15 37 55 / 0.25)',
}
