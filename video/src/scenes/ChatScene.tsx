import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { Character } from '../../../src/web/src/components/Character'
import { card, Frame, Panda, VIOLET } from '../brand'
import { COPY, type Lang } from '../copy'

const ease = Easing.bezier(0.16, 1, 0.3, 1)
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** circloo opens the activity: the panda draws itself, the question types in, two friends answer. */
export const ChatScene = ({ lang }: { lang: Lang }) => {
  const f = useCurrentFrame()
  const c = COPY[lang]
  const typed = Math.round(interpolate(f, [22, 58], [0, c.question.length], clamp))
  const reply = (start: number) => ({
    opacity: interpolate(f, [start, start + 10], [0, 1], clamp),
    translate: `0 ${interpolate(f, [start, start + 14], [18, 0], { ...clamp, easing: ease })}px`,
  })
  return (
    <Frame dir={lang === 'ar' ? 'rtl' : 'ltr'} caption={c.chat}>
      <div style={{ ...card, position: 'absolute', left: 190, right: 190, top: 64, height: 470, padding: '32px 40px', display: 'grid', alignContent: 'start', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Panda size={64} progress={interpolate(f, [0, 30], [0, 1], clamp)} />
          <span style={{ fontSize: 26, fontWeight: 600 }}>circloo</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: VIOLET, background: '#f2efff', border: '1px solid #d9d0fb', borderRadius: 4, padding: '2px 8px', letterSpacing: lang === 'ar' ? 0 : '0.04em' }}>AI</span>
        </div>
        <div style={{ fontSize: 38, fontWeight: 600, lineHeight: 1.3, minHeight: 100 }}>
          {c.question.slice(0, typed)}
          {typed < c.question.length ? <span style={{ display: 'inline-block', width: 16, height: 34, background: VIOLET, marginInlineStart: 4, verticalAlign: '-4px', opacity: Math.floor(f / 6) % 2 }} /> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, ...reply(62) }}>
          <div style={{ width: 52, height: 52 }}><Character id="fox" /></div>
          <div style={{ background: '#eef1f4', borderRadius: 18, padding: '12px 18px', fontSize: 28 }}>{c.replies[0]}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, ...reply(78) }}>
          <div style={{ width: 52, height: 52 }}><Character id="robot" /></div>
          <div style={{ background: '#eef1f4', borderRadius: 18, padding: '12px 18px', fontSize: 28 }}>{c.replies[1]}</div>
        </div>
      </div>
    </Frame>
  )
}
