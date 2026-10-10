import { useTranslation } from 'react-i18next'
import { Hand } from 'lucide-react'
import { useRoom } from '../room'
import { myHand } from './hands'
import { useHandAction } from './useHandAction'

/**
 * Raise hand / Lower hand for a participant, or "I'm done" once they have the floor (spec 008 US5). Nothing for the
 * animator, who gives the floor instead. Standalone so the call bar (spec 009 T927) can put it beside the device buttons.
 * With `onError` the refusal goes to the caller's own line; without it, the button says it under itself. With `place`,
 * a waiting hand carries its place in the queue as a small number, and "You are 2nd" in its name.
 */
export function HandButton({ className, size, onError, place = false }: {
  className?: string
  size?: 'sm'
  onError?: (message: string | null) => void
  place?: boolean
}) {
  const { t } = useTranslation()
  const me = useRoom((s) => s.me)
  const hands = useRoom((s) => s.hands)
  const { busy, error, run } = useHandAction(onError)
  if (!me || me.role === 'animator') return null

  const mine = myHand(hands, me.id)
  const up = mine.kind !== 'none'
  const label = mine.kind === 'floor' ? t('circles.hands.done') : up ? t('circles.hands.lower') : t('circles.hands.raise')
  const placeText = place && mine.kind === 'queue' ? t('circles.hands.place', { count: mine.place, ordinal: true }) : null
  const press = () => void run('me', () => (up ? useRoom.getState().lowerHand() : useRoom.getState().raiseHand()))

  const button = (
    <button
      type="button"
      className={['btn', up ? 'btn--default' : 'btn--primary', size === 'sm' ? 'btn--sm' : '', 'hand-btn', up ? 'is-up' : '', className].filter(Boolean).join(' ')}
      data-hand={mine.kind}
      aria-busy={busy ? true : undefined}
      title={placeText ?? undefined}
      onClick={press}
    >
      <Hand size={size === 'sm' ? 16 : 18} aria-hidden="true" className="hand-btn__icon" />
      <span className="hand-btn__label">{label}</span>
      {placeText && mine.kind === 'queue' ? (
        <>
          <span className="hand-btn__place" aria-hidden="true">{mine.place}</span>
          <span className="visually-hidden">, {placeText}</span>
        </>
      ) : null}
    </button>
  )
  if (onError) return button
  return (
    <>
      {button}
      {error ? <p className="field__error hand-btn__error" role="alert">{error}</p> : null}
    </>
  )
}
