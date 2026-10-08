import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart } from 'lucide-react'
import { Character } from '../../components/Character'
import type { CharacterId } from '../../components/characters'
import { useUiStore } from '../../stores/ui'

/* Positions on the board, in hundredths of its width (the board is a 16:10 inline-size container, so `cqi` scales
   everything together). Each is where the element rests when the scene is still; the loop starts elsewhere. */
const NOTES: { n: number; tone: string; x: number; y: number; r: number; votes?: number }[] = [
  { n: 0, tone: 'mint', x: 5, y: 4, r: -3 },
  { n: 4, tone: 'butter', x: 34, y: 4, r: 2, votes: 3 },
  { n: 2, tone: 'peach', x: 38, y: 30, r: -1, votes: 4 },
  { n: 3, tone: 'sky', x: 6, y: 28, r: 3 },
  { n: 1, tone: 'lavender', x: 70, y: 34, r: -2 },
]
const CURSORS: { name: string; body: number; x: number; y: number }[] = [
  { name: 'Nadia', body: 1, x: 48, y: 14 },
  { name: 'Karim', body: 2, x: 88, y: 28 },
  { name: 'Lucía', body: 3, x: 56, y: 54 },
]
const HERE: CharacterId[] = ['panda', 'fox', 'owl']

const at = (x: number, y: number, extra?: Record<string, string | number>) => ({ '--x': x, '--y': y, ...extra }) as CSSProperties

/**
 * The hero's motion piece (#250): circloo is collaboration, so the centre of the page is a small live board.
 * Three friends' cursors arrive, notes pop onto the board, one is dragged into place, dot votes drop, the panda asks
 * the icebreaker and a heart lands. CSS keyframes on transform only, looping while the visitor allows motion; still,
 * it shows the finished board. Decorative: the headline above it says what it is.
 */
export function Scene() {
  const { t } = useTranslation()
  const locale = useUiStore((s) => s.locale)
  const notes = t('landing.work.notes', { returnObjects: true }) as string[]
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene__bar">
        <span className="scene__dots"><i /><i /><i /></span>
        <span className="scene__name">{t('landing.made.names.brainstorm')}</span>
        <span className="scene__live">{t('landing.hero.live')}</span>
        <span className="scene__here">
          {HERE.map((c) => <Character key={c} id={c} tag={false} className="scene__face" />)}
          <span className="scene__count">{t('landing.made.people', { count: 3 })}</span>
        </span>
      </div>
      <div className="scene__board">
        {NOTES.map((note, i) => (
          <div key={note.n} className={`scene__note scene__note--${i + 1} scene__note--${note.tone}`} style={at(note.x, note.y, { '--r': `${note.r}deg` })}>
            <p>{notes[note.n]}</p>
            {note.votes ? (
              <span className="scene__votes">
                {Array.from({ length: note.votes }, (_, k) => <i key={k} className="scene__vote" style={{ '--k': k } as CSSProperties} />)}
              </span>
            ) : null}
            {i === 4 ? <span className="scene__heart"><Heart size={14} strokeWidth={2.5} fill="currentColor" /></span> : null}
          </div>
        ))}
        <div className="scene__bubble" style={at(4, 48)}>
          <Character id="panda" tag={false} className="scene__asker" />
          <p lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>{t(`landing.hero.ask.${locale}`)}</p>
        </div>
        {CURSORS.map((c, i) => (
          <span key={c.name} className={`scene__cursor scene__cursor--${i + 1}`} style={at(c.x, c.y, { '--cursor': `var(--body-${c.body})` })}>
            <svg viewBox="0 0 16 16"><path d="M1.5 1.5 L14 7.2 L8.4 8.6 L6.3 14.2 Z" /></svg>
            <span>{c.name}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
