import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { Character } from '../../../src/web/src/components/Character'
import type { CharacterId } from '../../../src/web/src/components/characters'
import { Frame } from '../brand'
import { COPY, type Lang } from '../copy'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

const NOTES: { x: number; y: number; w: number; color: string; round?: boolean; who: CharacterId; at: number; tilt: number }[] = [
  { x: 330, y: 230, w: 210, color: '#fff3b0', who: 'panda', at: 4, tilt: -2 },
  { x: 640, y: 210, w: 190, color: '#d6e9ff', round: true, who: 'axolotl', at: 14, tilt: 1 },
  { x: 470, y: 470, w: 190, color: '#e6dcff', who: 'llama', at: 24, tilt: 2 },
  { x: 900, y: 420, w: 170, color: '#ffd6e7', who: 'fox', at: 34, tilt: -1.5 },
]

const CURSORS: { who: CharacterId; color: string; path: [number, number][] }[] = [
  { who: 'axolotl', color: '#0b5bd3', path: [[1100, 120], [860, 260], [700, 300], [760, 180], [980, 230]] },
  { who: 'llama', color: '#2b8a3e', path: [[200, 600], [380, 520], [520, 470], [600, 520], [440, 600]] },
  { who: 'fox', color: '#c2255c', path: [[1150, 600], [980, 470], [900, 420], [1010, 360], [1090, 520]] },
]

/** A point along a cursor's path at progress t (0 → 1), smoothed between waypoints. */
function along(path: [number, number][], t: number): [number, number] {
  const seg = Math.min(path.length - 2, Math.floor(t * (path.length - 1)))
  const local = t * (path.length - 1) - seg
  const e = Easing.inOut(Easing.cubic)(local)
  const [a, b] = [path[seg]!, path[seg + 1]!]
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]
}

/** Everyone on one canvas: notes land, cursors glide with their characters, one note gets dragged and starred. */
export const CanvasScene = ({ lang }: { lang: Lang }) => {
  const f = useCurrentFrame()
  const c = COPY[lang]
  // The fox drags the pink note between frames 60 and 84.
  const drag = interpolate(f, [60, 84], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) })
  const star = interpolate(f, [92, 102], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) })
  return (
    <Frame dir={lang === 'ar' ? 'rtl' : 'ltr'} caption={c.board}>
      <div dir="ltr" style={{ position: 'absolute', inset: 0, backgroundColor: '#eef1f4', backgroundImage: 'radial-gradient(circle, #b9c2cc 1.6px, transparent 2px)', backgroundSize: '30px 30px' }}>
        {NOTES.map((n, i) => {
          const drop = interpolate(f, [n.at, n.at + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) })
          const dx = i === 3 ? drag * -160 : 0
          const dy = i === 3 ? drag * 120 : 0
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: n.x + dx - n.w / 2, top: n.y + dy - n.w / 2, width: n.w, height: n.w,
                background: n.color, borderRadius: n.round ? '50%' : 10, padding: n.round ? 34 : 20, boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', justifyContent: n.round ? 'center' : 'space-between', alignItems: n.round ? 'center' : 'stretch',
                textAlign: n.round ? 'center' : 'start', boxShadow: i === 3 && drag > 0 && drag < 1 ? '0 26px 40px -14px rgb(15 37 55 / 0.5)' : '0 12px 22px -10px rgb(15 37 55 / 0.35)',
                opacity: drop, scale: `${1.25 - 0.25 * drop}`, rotate: `${n.tilt}deg`,
              }}
            >
              <div dir="auto" style={{ fontSize: 28, fontWeight: 500, lineHeight: 1.25 }}>{c.canvas.notes[i]}</div>
              <div style={{ width: 34, height: 34, marginTop: 10 }}><Character id={n.who} /></div>
              {i === 0 ? (
                <div style={{ position: 'absolute', top: -16, right: -16, width: 46, height: 46, borderRadius: 23, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 6px 14px -6px rgb(15 37 55 / 0.4)', scale: `${star}`, rotate: `${(1 - star) * -40}deg` }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="#d9480f"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
                </div>
              ) : null}
            </div>
          )
        })}
        {CURSORS.map((cur, i) => {
          const t = i === 2 && f >= 48 ? interpolate(f, [48, 60, 84, 110], [0.5, 0.5, 0.62, 1], clamp) : interpolate(f, [8 + i * 6, 110], [0, 1], clamp)
          let [x, y] = along(cur.path, t)
          if (i === 2 && f >= 60 && f <= 84) [x, y] = [900 - 160 * drag + 20, 420 + 120 * drag + 20]
          const wiggle = Math.sin(f * 0.9 + i) * 8
          return (
            <div key={cur.who} style={{ position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'flex-start', opacity: interpolate(f, [8 + i * 6, 14 + i * 6], [0, 1], clamp) }}>
              <svg width="28" height="28" viewBox="0 0 16 16"><path d="M1.5 1.5 L14 7.2 L8.4 8.6 L6.3 14.2 Z" fill={cur.color} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" /></svg>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 20, marginLeft: -4, padding: '3px 14px 3px 3px', borderRadius: 999, background: cur.color, color: '#fff', fontSize: 22, fontWeight: 600, whiteSpace: 'nowrap' }}>
                <div style={{ width: 34, height: 34, borderRadius: 17, background: '#fff', rotate: `${wiggle}deg` }}><Character id={cur.who} /></div>
                <span dir="auto">{c.canvas.names[i]}</span>
              </div>
            </div>
          )
        })}
      </div>
    </Frame>
  )
}
