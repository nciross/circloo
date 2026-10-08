import { useTranslation } from 'react-i18next'
import type { CSSProperties } from 'react'
import { Heart, MessageCircleQuestion } from 'lucide-react'
import { Character } from '../../components/Character'
import type { CharacterId } from '../../components/characters'
import { Loop, MusicNote, Squiggle, Burst } from './Doodles'

/* Organic blob shapes in a 236 × 196 box, all drawn clockwise so the clip union with the rectangle above works. */
const SHAPES = {
  a: 'M30 72 C 38 22 120 2 172 20 C 226 40 240 112 206 158 C 174 200 86 200 48 172 C 8 142 22 104 30 72 Z',
  b: 'M18 96 C 14 40 86 8 140 14 C 196 20 234 62 226 118 C 218 176 150 198 92 186 C 36 174 22 150 18 96 Z',
  c: 'M44 40 C 90 6 176 4 210 48 C 240 90 226 160 176 182 C 124 204 48 190 24 142 C 2 98 8 66 44 40 Z',
  d: 'M22 84 C 30 28 104 6 160 12 C 214 18 236 70 230 124 C 224 178 160 198 104 190 C 46 182 14 140 22 84 Z',
} as const
/**
 * What each picture does in step with the board's loop (Scene.tsx, 14 s): the panda posts a note as the first notes
 * pop in, the fox slides one across while Karim drags the peach note, the owl votes while Lucía drops the dots, and
 * the robot asks with the panda, then sends the heart. Each reaction sits on the side facing the board.
 */
function Fx({ id }: { id: keyof typeof SHAPES }) {
  if (id === 'a') return <span className="blob__fx blob__fx--note blob__fx--mint" />
  if (id === 'b') return <span className="blob__fx blob__fx--note blob__fx--peach" />
  if (id === 'c') {
    return (
      <span className="blob__fx blob__fx--votes">
        <i /><i /><i />
      </span>
    )
  }
  return (
    <>
      <span className="blob__fx blob__fx--ask"><MessageCircleQuestion size={20} strokeWidth={2.25} /></span>
      <span className="blob__fx blob__fx--heart"><Heart size={16} strokeWidth={2.5} fill="currentColor" /></span>
    </>
  )
}

/** The cast is clipped by the blob below this line and free above it: heads rise over the shape, feet stop at its edge. */
const ABOVE = 'M0 0 H236 V118 H0 Z '

type Tone = 'mint' | 'peach' | 'lavender' | 'butter' | 'sky-pastel'
interface BlobSpec { id: keyof typeof SHAPES; tone: Tone; tag: Tone; cast: CharacterId[] }

const START: BlobSpec[] = [
  { id: 'a', tone: 'mint', tag: 'butter', cast: ['panda', 'bunny'] },
  { id: 'b', tone: 'peach', tag: 'sky-pastel', cast: ['fox'] },
]
const END: BlobSpec[] = [
  { id: 'c', tone: 'lavender', tag: 'mint', cast: ['owl', 'frog'] },
  { id: 'd', tone: 'butter', tag: 'peach', cast: ['robot', 'dino'] },
]

function Blob({ spec, index }: { spec: BlobSpec; index: number }) {
  const { t } = useTranslation()
  const d = SHAPES[spec.id]
  return (
    <figure
      className={`blob blob--${spec.id}`}
      style={{ '--clip': `path('${ABOVE}${d}')`, '--i': index } as CSSProperties}
    >
      <svg className="blob__shape" viewBox="0 0 236 196" aria-hidden="true" focusable="false">
        <path d={d} fill={`var(--${spec.tone})`} />
      </svg>
      <span className="blob__cast">
        {spec.cast.map((c, i) => <Character key={c} id={c} tag={false} className={`blob__char blob__char--${i + 1}`} />)}
      </span>
      <Fx id={spec.id} />
      <figcaption className={`blob__tag blob__tag--${spec.tag}`}>{t(`landing.blobs.${spec.id}`)}</figcaption>
    </figure>
  )
}

/**
 * The hero's two wings (#250): two blobs each side with characters cut out over them and a handwritten tag, plus a
 * few doodles. Decorative; hidden under 64rem. While the visitor allows motion they play along with the board in
 * the centre (same 14 s loop); still, they show the finished moment.
 */
export function Blobs() {
  return (
    <>
      <div className="hero__side hero__side--start" aria-hidden="true">
        <Blob spec={START[0]!} index={0} />
        <Squiggle className="hero__doodle hero__doodle--squiggle" />
        <Blob spec={START[1]!} index={1} />
        <MusicNote className="hero__doodle hero__doodle--note" />
      </div>
      <div className="hero__side hero__side--end" aria-hidden="true">
        <Blob spec={END[0]!} index={2} />
        <Burst className="hero__doodle hero__doodle--star" />
        <Blob spec={END[1]!} index={3} />
        <Loop className="hero__doodle hero__doodle--loop" />
      </div>
    </>
  )
}
