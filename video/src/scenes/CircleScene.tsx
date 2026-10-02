import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { Character } from '../../../src/web/src/components/Character'
import type { CharacterId } from '../../../src/web/src/components/characters'
import { BLUE, Face, Frame } from '../brand'
import { COPY, type Lang } from '../copy'

const CAST: { id: CharacterId; name: string }[] = [
  { id: 'panda', name: 'Amina' },
  { id: 'fox', name: 'Théo' },
  { id: 'octopus', name: 'Lucía' },
  { id: 'robot', name: 'Youssef' },
  { id: 'frog', name: 'Mia' },
  { id: 'owl', name: 'Kenji' },
  { id: 'bunny', name: 'Sara' },
  { id: 'dino', name: 'Noah' },
]
const R = 190
const C = { x: 640, y: 282 }

/** People join one by one and take their seat on the ring; the face gets happier with each arrival. */
export const CircleScene = ({ lang }: { lang: Lang }) => {
  const f = useCurrentFrame()
  const c = COPY[lang]
  const joined = interpolate(f, [8, 8 + CAST.length * 7], [0, CAST.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <Frame dir={lang === 'ar' ? 'rtl' : 'ltr'} caption={c.circle} captionOpacity={interpolate(f, [10, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}>
      <svg width={1280} height={720} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={C.x} cy={C.y} r={R * 0.62} fill="#e8f0fe" />
        <circle
          cx={C.x}
          cy={C.y}
          r={R}
          fill="none"
          stroke={BLUE}
          strokeOpacity={0.45}
          strokeWidth={3}
          strokeDasharray="10 12"
          strokeDashoffset={-f * 0.8}
          pathLength={undefined}
          style={{ opacity: interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' }) }}
        />
      </svg>
      <div style={{ position: 'absolute', left: C.x - 90, top: C.y - 92 }}>
        <Face size={180} smile={interpolate(joined, [0, 8], [0.2, 1])} look={Math.sin(f / 9) * 0.6} />
      </div>
      {CAST.map((p, i) => {
        const angle = (i / CAST.length) * Math.PI * 2 - Math.PI / 2
        const start = 8 + i * 7
        const pop = interpolate(f, [start, start + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.spring({ damping: 11 }) })
        const bob = Math.sin((f + i * 11) / 8) * 3 * pop
        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: C.x + Math.cos(angle) * R - 48,
              top: C.y + Math.sin(angle) * R - 54,
              width: 96,
              display: 'grid',
              justifyItems: 'center',
              gap: 4,
              scale: pop,
              opacity: pop,
              translate: `0 ${bob - (1 - pop) * 40}px`,
            }}
          >
            <Character id={p.id} />
            <span dir="auto" style={{ fontSize: 20, fontWeight: 600, background: '#fff', borderRadius: 999, padding: '0 10px', boxShadow: '0 1px 2px rgb(15 37 55 / 0.15)' }}>{p.name}</span>
          </div>
        )
      })}
    </Frame>
  )
}
