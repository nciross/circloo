import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { Bird } from '../../../src/web/src/features/pirikoo/Bird'
import { BLUE, Face, Frame } from '../brand'
import { COPY, type Lang } from '../copy'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** Pirikoo flies in and lands by the face; the invitation to start. */
export const Outro = ({ lang }: { lang: Lang }) => {
  const f = useCurrentFrame()
  const c = COPY[lang]
  const fly = interpolate(f, [6, 34], [0, 1], { ...clamp, easing: Easing.bezier(0.22, 1, 0.36, 1) })
  const flap = f < 34 ? Math.sin(f * 1.6) : 0
  return (
    <Frame dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 26 }}>
        <div style={{ position: 'relative' }}>
          <Face size={200} smile={1} look={interpolate(f, [10, 34], [1, 0.4], clamp)} />
          <div
            style={{
              position: 'absolute',
              width: 96,
              height: 108,
              left: 190,
              top: -40,
              translate: `${(1 - fly) * 520}px ${(1 - fly) * -260 + Math.sin(fly * Math.PI) * -40}px`,
              rotate: `${flap * 8 - (1 - fly) * 12}deg`,
            }}
          >
            <Bird />
          </div>
        </div>
        <div dir="ltr" style={{ fontSize: 96, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, opacity: interpolate(f, [16, 28], [0, 1], clamp) }}>circloo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: interpolate(f, [26, 40], [0, 1], clamp), translate: `0 ${interpolate(f, [26, 40], [14, 0], clamp)}px` }}>
          <span style={{ background: BLUE, color: '#fff', borderRadius: 10, padding: '16px 30px', fontSize: 38, fontWeight: 600 }}>{c.cta}</span>
          <span style={{ fontSize: 30, color: '#45576a' }}>{c.free}</span>
        </div>
      </div>
    </Frame>
  )
}
