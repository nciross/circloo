import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { Face, Frame } from '../brand'
import { COPY, type Lang } from '../copy'

const ease = Easing.bezier(0.16, 1, 0.3, 1)

/** The face wakes up: eyes pop, the mouth draws into a smile, the name and the promise appear. */
export const Intro = ({ lang }: { lang: Lang }) => {
  const f = useCurrentFrame()
  const c = COPY[lang]
  return (
    <Frame dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 28 }}>
        <div style={{ scale: interpolate(f, [0, 22], [0.6, 1], { extrapolateRight: 'clamp', easing: Easing.spring({ damping: 12 }) }), opacity: interpolate(f, [0, 8], [0, 1], { extrapolateRight: 'clamp' }) }}>
          <Face
            size={260}
            eyes={interpolate(f, [4, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.spring({ damping: 9 }) })}
            draw={interpolate(f, [16, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })}
            smile={interpolate(f, [30, 48], [0.2, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })}
            look={interpolate(f, [50, 62, 74, 86], [0, -1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
          />
        </div>
        <div dir="ltr" style={{ fontSize: 112, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, opacity: interpolate(f, [26, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), translate: `0 ${interpolate(f, [26, 40], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })}px` }}>
          circloo
        </div>
        <div style={{ fontSize: 44, fontWeight: 500, color: '#45576a', opacity: interpolate(f, [40, 54], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          {c.tagline}
        </div>
      </div>
    </Frame>
  )
}
