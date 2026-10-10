import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Phone, PhoneOff, Volume2 } from 'lucide-react'
import type { HandsView, Member } from '../../../api/circles'
import { Character } from '../../../components/Character'
import { useStage, type CallParticipant } from './stage'
import { DiscussionSwitch } from './DiscussionSwitch'

/**
 * The Call tab of the room's focal card (spec 009 US2, T925). The animator keeps the switch (T926 turns it into three);
 * everyone reads whether a call is on, how many are in it, joins with one tap (microphone and camera off, FR-904) and
 * leaves the same way. The people in the call are buddy rows with their state in words (US7 #4). The raised hands queue
 * along an arc above them (spec 008; T927 brings the full queue).
 */
export function CallPanel({ isAnimator, members = [], hands }: { isAnimator: boolean; members?: Member[]; hands?: HandsView }) {
  const { t } = useTranslation()
  const discussion = useStage((s) => s.discussion)
  const roster = useStage((s) => s.roster)
  const connection = useStage((s) => s.connection)
  const error = useStage((s) => s.error)
  const participants = useStage((s) => s.participants)
  const audioBlocked = useStage((s) => s.audioBlocked)
  const join = useStage((s) => s.join)
  const leave = useStage((s) => s.leave)
  const startAudio = useStage((s) => s.startAudio)
  const on = discussion?.on ?? false
  const available = discussion?.available ?? true
  const byId = (id: string) => members.find((m) => m.id === id)
  const inCall = connection === 'connected' || connection === 'reconnecting'

  // In the call, the call server's list is the freshest; otherwise the roster the hub sends.
  const live = new Map(participants.map((p) => [p.id, p]))
  const ids = inCall ? participants.map((p) => p.id) : roster
  const people = ids.flatMap((id) => {
    const member = byId(id)
    return member ? [{ member, state: live.get(id) }] : []
  })
  const count = inCall ? participants.length : roster.length
  const queue = (hands?.queue ?? []).flatMap((h) => {
    const member = byId(h.memberId)
    return member ? [member] : []
  })

  const stateText = !available ? t('circles.call.errors.calls-unavailable')
    : !on ? t('circles.call.isOff')
      : discussion?.videoAllowed ? t('circles.call.videoOn') : t('circles.call.audioOn')

  return (
    <div className="call">
      {isAnimator && available ? <DiscussionSwitch /> : null}
      <section className="call__now" aria-labelledby="call-now-state">
        <p id="call-now-state" className="call__state" role="status">
          <span className={`call__state-mark${on ? ' is-on' : ''}`} aria-hidden="true" />
          {stateText}
        </p>
        {on && available ? (
          <>
            {count > 0 ? <p className="call__count">{t('circles.call.inCall', { count })}</p> : null}
            {connection === 'idle' ? (
              <button type="button" className="btn btn--primary call__join" onClick={() => void join()}>
                <Phone size={18} aria-hidden="true" />
                {t('circles.call.join')}
              </button>
            ) : connection === 'joining' ? (
              <button type="button" className="btn btn--primary call__join" aria-disabled="true" aria-busy="true">
                {t('circles.call.joining')}
              </button>
            ) : connection === 'failed' ? (
              <>
                <p className="field__error" role="alert">{t(`circles.call.errors.${error ?? 'failed'}`, { defaultValue: t('circles.call.errors.failed') })}</p>
                <button type="button" className="btn btn--primary call__join" onClick={() => void join()}>
                  <Phone size={18} aria-hidden="true" />
                  {t('circles.call.joinAgain')}
                </button>
              </>
            ) : (
              <div className="call__in">
                <p className="call__you">{connection === 'reconnecting' ? t('circles.call.reconnecting') : t('circles.call.youAreIn')}</p>
                {audioBlocked ? (
                  <button type="button" className="btn btn--primary" onClick={() => void startAudio()}>
                    <Volume2 size={18} aria-hidden="true" />
                    {t('circles.call.hear')}
                  </button>
                ) : null}
                <button type="button" className="btn btn--default call__leave" onClick={() => void leave()}>
                  <PhoneOff size={18} aria-hidden="true" />
                  {t('circles.call.leave')}
                </button>
              </div>
            )}
          </>
        ) : null}
      </section>
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
      {on && people.length > 0 ? (
        <section className="call__people" aria-labelledby="call-people-title">
          <h2 id="call-people-title" className="call__people-title">{t('circles.call.people')}</h2>
          <ul className="call__list">
            {people.map(({ member, state }) => (
              <li key={member.id} className={`call__person${state?.speaking ? ' is-speaking' : ''}`}>
                <Character id={member.character} ring={member.ring} tag={false} className="call__person-char" />
                <span className="call__person-text">
                  <span className="call__person-name">
                    <bdi>{member.name}</bdi>
                    {state?.local ? <span className="call__person-you"> {t('circles.call.you')}</span> : null}
                  </span>
                  <PersonState state={state} floor={hands?.floor === member.id} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/** The state in words, as the grid shows it: speaking, the floor, the microphone and the camera. */
function PersonState({ state, floor }: { state?: CallParticipant; floor: boolean }) {
  const { t } = useTranslation()
  const words = [
    state?.speaking ? t('circles.call.speakingWord') : null,
    floor ? t('circles.call.floor') : null,
    state && !state.mic ? t('circles.call.micOff') : null,
    state?.camera ? t('circles.call.cameraOn') : null,
  ].filter(Boolean)
  if (words.length === 0) return null
  return <span className="call__person-state">{words.join(' · ')}</span>
}
