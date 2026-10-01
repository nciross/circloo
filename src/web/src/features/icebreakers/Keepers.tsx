import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, Trash2 } from 'lucide-react'
import { useDeleteMine, useFavourites, useMine, useToggleFavourite, type Spark } from '../../api/sparks'
import { useDeckStore } from '../../stores/deck'
import { ChoiceMagnets } from '../../components/ChoiceMagnets'

/** The keepers shelf: favourites and the AI cards a member decided to keep. */
export function Keepers() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'favourites' | 'mine'>('favourites')
  const favourites = useFavourites()
  const mine = useMine()
  const toggle = useToggleFavourite()
  const remove = useDeleteMine()
  const pin = useDeckStore((s) => s.pin)
  const list: Spark[] | undefined = tab === 'favourites' ? favourites.data : mine.data

  return (
    <section className="keepers" aria-labelledby="keepers-title">
      <div className="keepers__head">
        <h2 id="keepers-title" className="keepers__title">{t('ice.keepers.title')}</h2>
        <ChoiceMagnets
          label={t('ice.keepers.title')}
          value={tab}
          onChange={setTab}
          tone="ink"
          hideLabel
          choices={[
            { value: 'favourites', label: t('ice.keepers.favourites') },
            { value: 'mine', label: t('ice.keepers.mine') },
          ]}
        />
      </div>
      {list && list.length === 0 ? (
        <p className="keepers__empty">{tab === 'favourites' ? t('ice.keepers.emptyFavourites') : t('ice.keepers.emptyMine')}</p>
      ) : (
        <ul className="keeper-notes">
          {(list ?? []).map((s) => (
            <li key={s.id} className={`keeper-note keeper-note--${s.kind}`} lang={s.lang}>
              <button type="button" className="keeper-note__open" onClick={() => pin(s)}>{s.text}</button>
              {tab === 'favourites' ? (
                <button type="button" className="keeper-note__icon" aria-label={t('ice.card.unfavourite')} onClick={() => toggle.mutate({ id: s.id, on: false })}>
                  <Heart size={16} strokeWidth={2.5} aria-hidden="true" />
                </button>
              ) : (
                <button type="button" className="keeper-note__icon" aria-label={t('ice.keepers.delete')} onClick={() => remove.mutate(s.id)}>
                  <Trash2 size={16} strokeWidth={2.5} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
