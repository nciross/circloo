import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { HandsView, Member } from '../../../api/circles'
import { Character } from '../../../components/Character'
import { useStage } from './stage'
import { DiscussionSwitch } from './DiscussionSwitch'

/**
 * The Call tab of the room's dark card (#250). The animator gets the real Live discussion switch; everyone sees whether it is
 * on and the stage: a sunken block of the card with the people on stage as rounded tiles (their character while the camera
 * is off), the one with the floor outlined in the ok colour, and the raised hands queued along an arc. Audio and video
 * (T906/T907) come next.
 */
export function CallPanel({ isAnimator, members = [], hands }: { isAnimator: boolean; members?: Member[]; hands?: HandsView }) {
  const { t } = useTranslation()
  const on = useStage((s) => s.discussion?.on ?? false)
  const seats = useStage((s) => s.seats)
  const byId = (id: string) => members.find((m) => m.id === id)

  // Discussion on: the seats are the stage, those on it have the floor. Off: the one 008 floor marker, if any.
  const tiles = on
    ? seats.flatMap((seat) => {
        const member = byId(seat.memberId)
        return member ? [{ member, floor: seat.state === 'onStage', dim: seat.state !== 'onStage' }] : []
      })
    : hands?.floor && byId(hands.floor)
      ? [{ member: byId(hands.floor)!, floor: true, dim: false }]
      : []
  const queue = (hands?.queue ?? []).flatMap((h) => {
    const member = byId(h.memberId)
    return member ? [member] : []
  })

  return (
    <div className="call">
      {isAnimator ? (
        <DiscussionSwitch />
      ) : (
        <p className="call__state" role="status">
          <span className={`call__state-mark${on ? ' is-on' : ''}`} aria-hidden="true" />
          {on ? t('circles.call.isOn') : t('circles.call.isOff')}
        </p>
      )}
      <section className="call__stage" aria-labelledby="call-stage-title">
        <h2 id="call-stage-title" className="call__stage-title">
          {t('circles.call.stage')}
          <span className="lozenge">{t('common.soon')}</span>
        </h2>
        {queue.length > 0 ? (
          <ol className="call__arc" aria-label={t('circles.room.hands', { count: queue.length })} style={{ '--n': queue.length } as CSSProperties}>
            {queue.map((m, i) => (
              <li key={m.id} className="call__hand" style={{ '--i': i } as CSSProperties}>
                <Character id={m.character} ring={m.ring} tag={false} className="call__hand-char" />
                <span className="visually-hidden">{m.name}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {tiles.length > 0 ? (
          <ul className="call__tiles" aria-label={t('circles.call.stage')}>
            {tiles.map(({ member, floor, dim }) => (
              <li key={member.id} className={`call__tile${floor ? ' is-floor' : ''}${dim ? ' is-dim' : ''}`}>
                <Character id={member.character} ring={member.ring} tag={false} className="call__tile-char" />
                <span className="call__tile-name"><bdi>{member.name}</bdi></span>
                {floor ? <span className="visually-hidden">, {t('circles.call.floor')}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="call__stage-body">{t('circles.call.stageBody')}</p>
      </section>
    </div>
  )
}
