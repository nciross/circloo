import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Frame, GREEN } from '../brand'
import { COPY, type Lang } from '../copy'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const SERVICES = [
  { logo: 'teams', name: 'Teams' },
  { logo: 'jira', name: 'Jira' },
  { logo: 'notion', name: 'Notion' },
]

/** The summary card flies to each service and comes back with a check. */
export const SendScene = ({ lang }: { lang: Lang }) => {
  const f = useCurrentFrame()
  const c = COPY[lang]
  return (
    <Frame dir={lang === 'ar' ? 'rtl' : 'ltr'} caption={c.send}>
      <div dir="ltr" style={{ position: 'absolute', left: 0, right: 0, top: 120, display: 'flex', justifyContent: 'center', gap: 90 }}>
        {SERVICES.map((s, i) => {
          const at = 14 + i * 14
          const pop = interpolate(f, [at, at + 12], [0, 1], { ...clamp, easing: Easing.spring({ damping: 11 }) })
          const check = interpolate(f, [at + 16, at + 26], [0, 1], { ...clamp, easing: Easing.spring({ damping: 10 }) })
          return (
            <div key={s.logo} style={{ display: 'grid', justifyItems: 'center', gap: 16, scale: pop, opacity: pop }}>
              <div style={{ position: 'relative', width: 150, height: 150, borderRadius: 28, background: '#fff', border: '1px solid #dfe3e8', display: 'grid', placeItems: 'center', boxShadow: '0 18px 36px -16px rgb(15 37 55 / 0.35)' }}>
                <Img src={staticFile(`brands/${s.logo}.svg`)} style={{ width: 92, height: 92, objectFit: 'contain' }} />
                <div style={{ position: 'absolute', right: -14, bottom: -14, width: 52, height: 52, borderRadius: 26, background: GREEN, display: 'grid', placeItems: 'center', scale: check }}>
                  <svg width={30} height={30} viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              </div>
              <span style={{ fontSize: 28, fontWeight: 600 }}>{s.name}</span>
            </div>
          )
        })}
      </div>
    </Frame>
  )
}
