import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Phone, PhoneOff, Volume2 } from 'lucide-react'
import type { Member } from '../../../api/circles'
import { Character } from '../../../components/Character'
import { hubCode, useRoom } from '../room'
import { HandsQueue } from '../room/HandsQueue'
import { callSupported, useStage, type CallParticipant } from './stage'
import { DiscussionSwitch } from './DiscussionSwitch'
import { PersonMenu } from './PersonMenu'
import { useAwayLeft } from './away'
import { AwayLine } from './AwayLine'
import { focusAfterLeave, markJoin } from './focus'

/**
 * The Call tab of the room's focal card (spec 009 US1, US2 and US3, T925 and T926). The animator has the switches (chat,
 * audio call, video call, who can speak) and a menu on each person; everyone reads whether a call is on, the speaking
 * mode in plain words, how many are in it, joins with one tap (microphone and camera off, FR-904) and leaves the same
 * way. The people in the call are buddy rows with their state in words (US7 #4). While a call is on, spec 008's raised
 * hands queue sits above them with "You are 2nd" (T927); in the call, Raise hand is on the call's bar, so the queue
 * leaves its own button out. While no animator is connected, the countdown to the call's end shows.
 */
export function CallPanel({ isAnimator, members = [] }: { isAnimator: boolean; members?: Member[] }) {
  const { t } = useTranslation()
  const discussion = useStage((s) => s.discussion)
  const hands = useRoom((s) => s.hands)
  const moderation = useStage((s) => s.moderation)
  const roster = useStage((s) => s.roster)
  const connection = useStage((s) => s.connection)
  const error = useStage((s) => s.error)
  const participants = useStage((s) => s.participants)
  const audioBlocked = useStage((s) => s.audioBlocked)
  const join = useStage((s) => s.join)
  const leave = useStage((s) => s.leave)
  const startAudio = useStage((s) => s.startAudio)
  const awayLeft = useAwayLeft()
  const [done, setDone] = useState('')
  const on = discussion?.on ?? false
  const available = discussion?.available ?? true
  const byId = (id: string) => members.find((m) => m.id === id)
  const inCall = connection === 'connected' || connection === 'reconnecting'
  const joinCall = () => {
    markJoin()
    void join()
  }

  // In the call, the call server's list is the freshest; otherwise the roster the hub sends.
  const live = new Map(participants.map((p) => [p.id, p]))
  const ids = inCall ? participants.map((p) => p.id) : roster
  const people = ids.flatMap((id) => {
    const member = byId(id)
    return member ? [{ member, state: live.get(id) }] : []
  })
  const count = inCall ? participants.length : roster.length

  const stateText = !available ? t('circles.call.errors.calls-unavailable')
    : !on ? t('circles.call.isOff')
      : discussion?.videoAllowed ? t('circles.call.videoOn') : t('circles.call.audioOn')
  const animators = new Set(members.filter((m) => m.role === 'animator').map((m) => m.id))
  // The animator's menu is for the others; another animator may always speak (contracts/hub.md, member-invalid).
  const menuFor = (id: string, local?: boolean) => isAnimator && on && !local && !animators.has(id)
  const removed = isAnimator && on
    ? moderation.removed.flatMap((id) => {
      const member = byId(id)
      return member ? [member] : []
    })
    : []

  return (
    <div className="call">
      <section className="call__now" aria-labelledby="call-now-state">
        <p id="call-now-state" className="call__state" role="status" tabIndex={-1}>
          <span className={`call__state-mark${on ? ' is-on' : ''}`} aria-hidden="true" />
          {stateText}
        </p>
        {on && available && !isAnimator ? (
          <p className="call__mode">{discussion?.speaking === 'open' ? t('circles.call.mode.openWords') : t('circles.call.mode.handWords')}</p>
        ) : null}
        {on && awayLeft !== null ? <AwayLine left={awayLeft} announce={!inCall} /> : null}
        {on && available ? (
          <>
            {count > 0 ? <p className="call__count">{t('circles.call.inCall', { count })}</p> : null}
            {connection === 'idle' && !callSupported() ? (
              // Nothing to try again: this browser has no live audio or video, and the room works without it (US4 #6).
              <p className="call__unsupported">{t('circles.call.errors.unsupported')}</p>
            ) : connection === 'idle' ? (
              <button type="button" className="btn btn--primary call__join" onClick={joinCall}>
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
                <button type="button" className="btn btn--primary call__join" onClick={joinCall}>
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
                <button
                  type="button"
                  className="btn btn--default call__leave"
                  onClick={() => {
                    void leave()
                    focusAfterLeave()
                  }}
                >
                  <PhoneOff size={18} aria-hidden="true" />
                  {t('circles.call.leave')}
                </button>
              </div>
            )}
          </>
        ) : null}
      </section>
      {/* What is happening and Join come first; the animator's switches follow, never pushing Join out of reach. */}
      {isAnimator ? <DiscussionSwitch /> : null}
      {on && available ? <HandsQueue className="call__hands" button={!inCall} /> : null}
      {on && people.length > 0 ? (
        <section className="call__people" aria-labelledby="call-people-title">
          <h2 id="call-people-title" className="call__people-title">{t('circles.call.people')}</h2>
          <ul className="call__list">
            {people.map(({ member, state }) => {
              const menu = menuFor(member.id, state?.local)
              return (
                <li key={member.id} className={`call__person${state?.speaking ? ' is-speaking' : ''}${menu ? ' has-menu' : ''}`}>
                  <Character id={member.character} ring={member.ring} tag={false} className="call__person-char" />
                  <span className="call__person-text">
                    <span className="call__person-name">
                      <bdi>{member.name}</bdi>
                      {state?.local ? <span className="call__person-you"> {t('circles.call.you')}</span> : null}
                    </span>
                    <PersonState
                      state={state}
                      floor={hands.floor === member.id}
                      micMuted={isAnimator && moderation.microphone.includes(member.id)}
                      cameraStopped={isAnimator && moderation.camera.includes(member.id)}
                    />
                  </span>
                  {menu ? <PersonMenu memberId={member.id} name={member.name} /> : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      {removed.length > 0 ? (
        <section className="call__people call__removed" aria-labelledby="call-removed-title">
          <h2 id="call-removed-title" className="call__people-title">{t('circles.call.removedTitle')}</h2>
          <ul className="call__list">
            {removed.map((member) => (
              <RemovedRow
                key={member.id}
                member={member}
                onBack={() => {
                  setDone(t('circles.call.allowBackDone', { name: member.name }))
                  // The row goes; the focus waits on the call's state rather than falling to the page.
                  document.getElementById('call-now-state')?.focus()
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}
      <p className="visually-hidden" aria-live="polite">{done}</p>
    </div>
  )
}

/** Someone the animator removed from this call (as far as this tab knows), with the one way back. */
function RemovedRow({ member, onBack }: { member: Member; onBack: () => void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const allow = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await useStage.getState().allowBack(member.id)
      onBack()
    } catch (e) {
      setError(t(`circles.call.errors.${hubCode(e)}`, { defaultValue: t('circles.call.errors.failed') }))
      setBusy(false)
    }
  }
  return (
    <li className="call__person has-menu">
      <Character id={member.character} ring={member.ring} tag={false} className="call__person-char" />
      <span className="call__person-text">
        <span className="call__person-name"><bdi>{member.name}</bdi></span>
        {error ? <span className="field__error call__person-error" role="alert">{error}</span> : null}
      </span>
      <button
        type="button"
        className="btn btn--default btn--sm call__allow-back"
        aria-busy={busy || undefined}
        aria-label={t('circles.call.allowBackFor', { name: member.name })}
        onClick={() => void allow()}
      >
        {t('circles.call.allowBack')}
      </button>
    </li>
  )
}

/**
 * The state in words, as the grid shows it: speaking, the floor, the microphone and the camera. The animator also reads
 * what they switched off themselves, so the menu's "Allow" has its reason in plain sight.
 */
function PersonState({ state, floor, micMuted = false, cameraStopped = false }: {
  state?: CallParticipant
  floor: boolean
  micMuted?: boolean
  cameraStopped?: boolean
}) {
  const { t } = useTranslation()
  const words = [
    state?.speaking ? t('circles.call.speakingWord') : null,
    floor ? t('circles.call.floor') : null,
    micMuted ? t('circles.call.micMutedByYou') : state && !state.mic ? t('circles.call.micOff') : null,
    cameraStopped ? t('circles.call.cameraStoppedByYou') : state?.camera ? t('circles.call.cameraOn') : null,
  ].filter(Boolean)
  if (words.length === 0) return null
  return <span className="call__person-state">{words.join(' · ')}</span>
}
