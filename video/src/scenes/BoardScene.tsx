import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { Character } from '../../../src/web/src/components/Character'
import type { CharacterId } from '../../../src/web/src/components/characters'
import { BLUE, Frame, GREEN, CORAL } from '../brand'
import { COPY, type Lang } from '../copy'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const NOTES: { col: number; color: string; who: CharacterId; votes: number; at: number }[] = [
  { col: 0, color: '#fff3b0', who: 'fox', votes: 3, at: 6 },
  { col: 1, color: '#ffd6e7', who: 'panda', votes: 1, at: 14 },
  { col: 2, color: '#d4f5df', who: 'robot', votes: 2, at: 22 },
  { col: 0, color: '#d6e9ff', who: 'owl', votes: 0, at: 30 },
  { col: 2, color: '#e6dcff', who: 'frog', votes: 1, at: 38 },
]
const TOP = [BLUE, CORAL, GREEN]

/** Notes drop onto a live board from everyone at once, then the dot votes land. */
export const BoardScene = ({ lang }: { lang: Lang }) => {
  const f = useCurrentFrame()
  const c = COPY[lang]
  const rtl = lang === 'ar'
  return (
    <Frame dir={rtl ? 'rtl' : 'ltr'} caption={c.board}>
      <div style={{ position: 'absolute', left: 110, right: 110, top: 60, height: 480, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }}>
        {[0, 1, 2].map((col) => (
          <div key={col} style={{ background: '#eef1f4', borderRadius: 14, borderTop: `5px solid ${TOP[col]}`, padding: 16, display: 'grid', alignContent: 'start', gap: 14 }}>
            <div style={{ fontSize: 26, fontWeight: 600 }}>{c.columns[col]}</div>
            {NOTES.map((n, i) => {
              if (n.col !== col) return null
              const drop = interpolate(f, [n.at, n.at + 14], [0, 1], { ...clamp, easing: Easing.spring({ damping: 12 }) })
              const shown = Math.round(interpolate(f, [60 + i * 5, 72 + i * 5], [0, n.votes], clamp))
              return (
                <div key={i} style={{ background: n.color, borderRadius: 10, padding: '14px 16px', display: 'grid', gap: 12, boxShadow: '0 6px 14px -8px rgb(15 37 55 / 0.4)', opacity: drop, translate: `0 ${(1 - drop) * -60}px`, rotate: `${(1 - drop) * (i % 2 ? 6 : -6)}deg` }}>
                  <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.3 }}>{c.notes[i]}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ width: 30, height: 30 }}><Character id={n.who} /></div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {Array.from({ length: shown }, (_, k) => (
                        <span key={k} style={{ width: 12, height: 12, borderRadius: 6, background: BLUE, scale: interpolate(f, [60 + i * 5 + k * 4, 66 + i * 5 + k * 4], [1.8, 1], clamp) }} />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </Frame>
  )
}
