import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { Bird } from '../../../src/web/src/features/pirikoo/Bird'
import { BLUE, Frame, GREEN, SUBTLE, card } from '../brand'
import { COPY, type Lang } from '../copy'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** Ask Pirikoo: the question, "writing" dots, then the answer streams in word by word while the bird talks. */
export const PirikooScene = ({ lang }: { lang: Lang }) => {
  const f = useCurrentFrame()
  const c = COPY[lang].pirikoo
  const rtl = lang === 'ar'
  const words = c.answer.split(' ')
  const shown = Math.floor(interpolate(f, [40, 100], [0, words.length], clamp))
  const writing = f >= 18 && f < 40
  const talking = f >= 40 && f < 100
  const ask = interpolate(f, [4, 16], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
  const bob = talking ? Math.sin(f * 0.9) * 3 : writing ? Math.sin(f * 0.5) * 6 : Math.sin(f * 0.15) * 1.5
  const hop = interpolate(f, [100, 106, 112], [0, -14, 0], clamp)
  return (
    <Frame dir={rtl ? 'rtl' : 'ltr'}>
      <div style={{ position: 'absolute', left: 250, right: 250, top: 50, bottom: 50, ...card, display: 'grid', gridTemplateRows: 'auto 1fr auto', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 26px', borderBottom: '1px solid #dfe3e8' }}>
          <div style={{ width: 56, height: 63, rotate: `${bob}deg`, translate: `0 ${hop}px` }}><Bird /></div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 650 }}>Pirikoo</div>
            <div style={{ fontSize: 20, color: writing || talking ? GREEN : SUBTLE, fontWeight: writing || talking ? 600 : 400 }}>{writing || talking ? c.writing + '…' : 'circloo'}</div>
          </div>
        </div>
        <div style={{ padding: 30, display: 'grid', alignContent: 'start', gap: 26 }}>
          <div style={{ justifySelf: 'end', background: '#e8f0fe', borderRadius: 18, padding: '14px 20px', fontSize: 28, opacity: ask, translate: `0 ${(1 - ask) * 20}px` }}>{c.question}</div>
          {f >= 18 ? (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 40, height: 45, flex: 'none', rotate: `${bob}deg` }}><Bird /></div>
              {writing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 600, color: GREEN }}>
                  {c.writing}
                  {[0, 1, 2].map((k) => (
                    <span key={k} style={{ width: 9, height: 9, borderRadius: 5, background: GREEN, opacity: 0.35 + 0.65 * Math.max(0, Math.sin((f - k * 3) * 0.45)), translate: `0 ${-4 * Math.max(0, Math.sin((f - k * 3) * 0.45))}px` }} />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 28, lineHeight: 1.5 }}>
                  {words.slice(0, shown).join(' ')}
                  {talking ? <span style={{ display: 'inline-block', width: 3, height: 30, marginInlineStart: 4, background: GREEN, verticalAlign: 'text-bottom', opacity: Math.floor(f / 8) % 2 }} /> : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div style={{ margin: '0 26px 24px', border: '1.5px solid #b9c2cc', borderRadius: 16, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: SUBTLE, fontSize: 22 }}>
          <span>…</span>
          <span style={{ width: 40, height: 40, borderRadius: 20, background: BLUE, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 24 }}>↑</span>
        </div>
      </div>
    </Frame>
  )
}
