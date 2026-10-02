import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, Trash2 } from 'lucide-react'
import { useDeleteMine, useFavourites, useMine, useToggleFavourite, type Spark } from '../../api/sparks'
import { useDeckStore } from '../../stores/deck'
import { Segmented } from '../../components/Segmented'

/** The keepers shelf: favourites and the AI cards a member decided to keep. */
export function Keepers() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'favourites' | 'mine'>('favourites')
  const favourites = useFavourites()
  const mine = useMine()
  const toggle = useToggleFavourite()
  const remove = useDeleteMine()
  const pin = useDeckStore((s) => s.pin)
  const query = tab === 'favourites' ? favourites : mine
  const list: Spark[] | undefined = query.data
  const listRef = useRef<HTMLUListElement>(null)
  const [failed, setFailed] = useState(false)

  // The removed card's button disappears: focus the next card, or the tabs when the list is empty.
  const afterRemove = (index: number) =>
    requestAnimationFrame(() => {
      const opens = listRef.current?.querySelectorAll<HTMLButtonElement>('.keeper__open')
      const next = opens?.[Math.min(index, (opens?.length ?? 1) - 1)]
      ;(next ?? document.querySelector<HTMLButtonElement>('.keepers .seg__opt[aria-pressed="true"]'))?.focus()
    })
  const onFail = () => setFailed(true)

  return (
    <section className="panel keepers" aria-labelledby="keepers-title">
      <div className="panel__head">
        <h2 id="keepers-title" className="panel__title">{t('ice.keepers.title')}</h2>
        <Segmented
          label={t('ice.keepers.title')}
          value={tab}
          onChange={setTab}
          hideLabel
          choices={[
            { value: 'favourites', label: t('ice.keepers.favourites') },
            { value: 'mine', label: t('ice.keepers.mine') },
          ]}
        />
      </div>
      {failed ? <p className="field__error" role="alert">{t('common.errorGeneric')}</p> : null}
      {query.isPending ? (
        <p className="keepers__empty" role="status">{t('common.loading')}</p>
      ) : query.isError ? (
        <p className="field__error" role="alert">{t('common.errorGeneric')}</p>
      ) : list && list.length === 0 ? (
        <p className="keepers__empty">{tab === 'favourites' ? t('ice.keepers.emptyFavourites') : t('ice.keepers.emptyMine')}</p>
      ) : (
        <ul ref={listRef} className="keepers__list">
          {(list ?? []).map((s, i) => (
            <li key={s.id} className={`keeper keeper--${s.kind}`} lang={s.lang}>
              <button type="button" className="keeper__open" dir="auto" aria-describedby="keepers-put" onClick={() => pin(s)}>{s.text}</button>
              {tab === 'favourites' ? (
                <button type="button" className="keeper__icon" aria-label={`${t('ice.card.favourite')}: ${s.text.slice(0, 40)}`} aria-pressed="true"
                  onClick={() => { setFailed(false); toggle.mutate({ id: s.id, on: false }, { onSuccess: () => afterRemove(i), onError: onFail }) }}>
                  <Heart size={16} strokeWidth={2.5} aria-hidden="true" />
                </button>
              ) : (
                <button type="button" className="keeper__icon" aria-label={`${t('ice.keepers.delete')}: ${s.text.slice(0, 40)}`} aria-busy={remove.isPending || undefined}
                  onClick={() => { if (remove.isPending) return; setFailed(false); remove.mutate(s.id, { onSuccess: () => afterRemove(i), onError: onFail }) }}>
                  <Trash2 size={16} strokeWidth={2.5} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p id="keepers-put" className="visually-hidden">{t('ice.keepers.putOnBoard')}</p>
    </section>
  )
}
