import { useTranslation } from 'react-i18next'
import { Character } from '../../components/Character'
import type { CharacterId } from '../../components/characters'

const TILES: { id: string; cast: CharacterId[]; tone: string }[] = [
  { id: 'family', cast: ['panda', 'bunny', 'bear'], tone: 'mint' },
  { id: 'retro', cast: ['robot', 'fox'], tone: 'sky' },
  { id: 'game', cast: ['dino', 'frog', 'octopus'], tone: 'peach' },
  { id: 'quiz', cast: ['owl', 'chick'], tone: 'butter' },
  { id: 'book', cast: ['koala', 'cat', 'hedgehog'], tone: 'lavender' },
]

/** "Popular circles": five pastel tiles with a small group of characters and a scalloped bottom edge. */
export function Popular() {
  const { t } = useTranslation()
  return (
    <section className="strip popular" aria-labelledby="popular-title">
      <div className="strip__head strip__head--stack">
        <div>
          <h2 id="popular-title" className="section-title">{t('landing.popular.title')}</h2>
          <p className="section-lead">{t('landing.popular.lead')}</p>
        </div>
        <p className="hand hand--pink popular__note">{t('landing.popular.note')}</p>
      </div>
      <ul className="popular__row">
        {TILES.map((tile) => (
          <li key={tile.id} className="city">
            <span className={`city__art city__art--${tile.tone}`} aria-hidden="true">
              {tile.cast.map((c) => <Character key={c} id={c} tag={false} className="city__char" />)}
            </span>
            <span className="city__name">{t(`landing.popular.items.${tile.id}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
