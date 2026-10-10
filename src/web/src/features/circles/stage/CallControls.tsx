import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, Mic, MicOff, PhoneOff, PanelsTopLeft, SmilePlus, Video, VideoOff, Volume2 } from 'lucide-react'
import type { Member } from '../../../api/circles'
import { Segmented } from '../../../components/Segmented'
import { useRoom } from '../room'
import { HandButton } from '../room/HandButton'
import { ReactionBar } from '../room/ReactionBar'
import { useAwayLeft } from './away'
import { AwayLine } from './AwayLine'
import { CallReactions } from './CallReactions'
import { useCompact } from './compact'
import { DeviceProblem } from './DeviceProblem'
import { focusAfterLeave, focusOnBar } from './focus'
import { useJoinsAnnouncement } from './joins'
import type { MediaKind } from './media'
import { PermissionPrimer } from './PermissionPrimer'
import { markPrimed, needsPrimer } from './primer'
import { useStage } from './stage'

export type CentreView = 'call' | 'round'

/**
 * The call's bottom bar (spec 009 US2 #5 and #7, US3, US4, US8): microphone, camera (video calls only), the raised hand,
 * the reactions and Leave under the thumb, "Tap to hear the call" when the browser held the sound back, Reconnecting
 * and Weak connection in words, and the switch between the call and the round when one runs. When the call failed it
 * says why and offers Join again, unless this browser cannot join at all. Switching a device on goes through the
 * permission primer, and a device that does not start says why in the status area (T907).
 * It sits in the page's flow at the bottom of the centre, so it never covers the chat composer of the sheet. Reactions
 * rise from it over the centre (T927); `reactions={false}` leaves them to a presentation that shows its own.
 */
export function CallControls({ members, view, onView, roundLabel, reactions = true }: {
  members: Member[]
  view: CentreView
  /** Given when the centre has a round to switch to. */
  onView?: (view: CentreView) => void
  roundLabel?: string
  reactions?: boolean
}) {
  const { t } = useTranslation()
  const connection = useStage((s) => s.connection)
  const error = useStage((s) => s.error)
  const join = useStage((s) => s.join)
  const leave = useStage((s) => s.leave)
  const leaveCall = () => {
    void leave()
    focusAfterLeave()
  }

  if (connection === 'idle') return null
  if (connection === 'failed') {
    return (
      <section className="call-bar is-failed" aria-label={t('circles.call.controls')}>
        <p className="call-bar__problem" role="alert">{t(`circles.call.errors.${error ?? 'failed'}`, { defaultValue: t('circles.call.errors.failed') })}</p>
        <div className="call-bar__end">
          {error === 'unsupported' ? null : (
            <button type="button" className="btn btn--primary" onClick={() => void join()}>{t('circles.call.joinAgain')}</button>
          )}
          <button type="button" className="btn btn--subtle" onClick={leaveCall}>{t('common.close')}</button>
        </div>
      </section>
    )
  }

  return (
    <section className={`call-bar is-${connection}`} aria-label={t('circles.call.controls')}>
      {connection === 'joining' ? (
        <p className="call-bar__state" role="status">{t('circles.call.joining')}</p>
      ) : (
        <InCall members={members} reactions={reactions} />
      )}
      <div className="call-bar__end">
        {onView && roundLabel ? (
          <Segmented
            label={t('circles.call.showIn')}
            hideLabel
            className="call-bar__view"
            value={view}
            onChange={onView}
            choices={[
              { value: 'call', label: t('circles.call.showCall'), ariaLabel: t('circles.call.showCall'), icon: <LayoutGrid size={16} /> },
              { value: 'round', label: roundLabel, ariaLabel: roundLabel, icon: <PanelsTopLeft size={16} /> },
            ]}
          />
        ) : null}
        <button type="button" className="btn btn--danger call-bar__leave" onClick={leaveCall}>
          <PhoneOff size={18} aria-hidden="true" />
          {/* On a phone the icon shows and the word stays its name. */}
          <span className="call-bar__leave-label">{t('circles.call.leave')}</span>
        </button>
      </div>
    </section>
  )
}

/** A refusal of the hand (too fast, offline) stays this long in the bar, then goes. */
const HAND_ERROR_FOR = 6000

/** The devices, the hand, the reactions and the call's health while you are in it. */
function InCall({ members, reactions }: { members: Member[]; reactions: boolean }) {
  const { t } = useTranslation()
  const connection = useStage((s) => s.connection)
  const me = useStage((s) => s.me)
  const rights = useStage((s) => s.myPermissions)
  const videoAllowed = useStage((s) => s.discussion?.videoAllowed ?? true)
  const audioBlocked = useStage((s) => s.audioBlocked)
  const participants = useStage((s) => s.participants)
  const setMic = useStage((s) => s.setMic)
  const setCamera = useStage((s) => s.setCamera)
  const startAudio = useStage((s) => s.startAudio)
  const problem = useStage((s) => s.deviceProblem)
  const dismissProblem = useStage((s) => s.dismissDeviceProblem)
  const [busy, setBusy] = useState<'mic' | 'camera' | null>(null)
  const [primer, setPrimer] = useState<MediaKind | null>(null)
  const micButton = useRef<HTMLButtonElement>(null)
  const cameraButton = useRef<HTMLButtonElement>(null)
  const awayLeft = useAwayLeft()
  const isAnimator = useRoom((s) => s.me?.role === 'animator')
  const speakingMode = useStage((s) => s.discussion?.speaking ?? 'hand')
  const reactionsOn = useRoom((s) => s.settings.reactions)
  const compact = useCompact()
  const [tray, setTray] = useState(false)
  const trayToggle = useRef<HTMLButtonElement>(null)
  const trayId = useId()
  const [handError, setHandError] = useState<string | null>(null)
  const onHandError = useCallback((m: string | null) => setHandError(m), [])
  useEffect(() => {
    if (!handError) return
    const timer = window.setTimeout(() => setHandError(null), HAND_ERROR_FOR)
    return () => window.clearTimeout(timer)
  }, [handError])

  const self = participants.find((p) => p.local)
  const weak = self?.quality === 'poor' || self?.quality === 'lost'
  const others = participants.filter((p) => !p.local)
  const names = new Map(members.map((m) => [m.id, m.name]))
  const announcement = useJoinsAnnouncement(
    others.map((p) => p.id),
    (id) => names.get(id) || others.find((p) => p.id === id)?.name || id,
    t,
  )

  const canSpeak = !!rights?.canSpeak
  const canVideo = !!rights?.canVideo
  // Hand to speak, no floor yet: there is no microphone to switch on, so Raise hand takes its place (US3 #2). With the
  // floor, or in Open mic, the hand sits after the devices. The animator gives the floor and has no hand.
  const handForMic = !isAnimator && speakingMode === 'hand' && !canSpeak
  const showReactions = reactions && reactionsOn
  const trayOpen = showReactions && compact && tray
  // The floor arrives or goes while the hand or the microphone has the focus: it moves to the one now in that place.
  const devicesRef = useRef<HTMLDivElement>(null)
  const speakFocus = useRef(false)
  // Joined from the Call tab: Join call went away under the focus, which moves on to the bar's first control.
  useEffect(() => {
    if (focusOnBar()) devicesRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [])
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body
    if (!speakFocus.current || !lost) return
    if (handForMic) devicesRef.current?.querySelector<HTMLButtonElement>('.call-bar__hand')?.focus()
    else micButton.current?.focus()
  }, [handForMic])
  const closeTray = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    setTray(false)
    trayToggle.current?.focus()
  }
  const run = async (which: 'mic' | 'camera', action: () => Promise<void>) => {
    if (busy) return
    setBusy(which)
    try {
      await action()
    } finally {
      setBusy(null)
    }
  }

  const allowed = (kind: MediaKind) => (kind === 'audio' ? canSpeak : canVideo && videoAllowed)
  const isOn = (kind: MediaKind) => (kind === 'audio' ? me.mic : me.camera)
  const focusDevice = (kind: MediaKind) => (kind === 'audio' ? micButton : cameraButton).current?.focus()
  const turnOn = (kind: MediaKind) => (kind === 'audio' ? setMic(true) : setCamera(true))
  // The browser asks only after the primer's Continue, the first time a kind is switched on in this session.
  const switchOn = (kind: MediaKind) =>
    run(kind === 'audio' ? 'mic' : 'camera', async () => {
      if (await needsPrimer(kind)) setPrimer(kind)
      else await turnOn(kind)
    })
  const proceed = (kind: MediaKind) => {
    markPrimed(kind)
    setPrimer(null)
    focusDevice(kind)
    void run(kind === 'audio' ? 'mic' : 'camera', () => turnOn(kind))
  }
  const cancel = (kind: MediaKind) => {
    setPrimer(null)
    focusDevice(kind)
  }
  // A device taken away (the floor moved on, video switched off) takes its primer and its problem with it.
  const shownPrimer = primer && allowed(primer) && !isOn(primer) ? primer : null
  const shownProblem = problem && (problem.kind === 'audio' || videoAllowed) ? problem : null

  return (
    <>
      <div className="call-bar__state">
        {shownPrimer ? <PermissionPrimer kind={shownPrimer} onContinue={() => proceed(shownPrimer)} onCancel={() => cancel(shownPrimer)} /> : null}
        {shownProblem ? (
          <DeviceProblem
            key={shownProblem.id}
            problem={shownProblem}
            onRetry={() => {
              // The problem goes while the device is tried again: the focus waits on the device, not on the page.
              focusDevice(shownProblem.kind)
              void switchOn(shownProblem.kind)
            }}
            onDismiss={() => {
              dismissProblem()
              focusDevice(shownProblem.kind)
            }}
          />
        ) : null}
        {handError ? <p className="call-bar__note is-warn" role="alert">{handError}</p> : null}
        {connection === 'reconnecting' ? <p className="call-bar__note is-warn" role="status">{t('circles.call.reconnecting')}</p> : null}
        {connection === 'connected' && weak ? <p className="call-bar__note is-warn" role="status">{t('circles.call.weakMine')}</p> : null}
        {awayLeft !== null ? <AwayLine left={awayLeft} announce className="call-bar__note is-warn" /> : null}
        {audioBlocked ? (
          <button type="button" className="btn btn--primary call-bar__hear" onClick={() => void startAudio()}>
            <Volume2 size={18} aria-hidden="true" />
            {t('circles.call.hear')}
          </button>
        ) : null}
      </div>
      <div
        ref={devicesRef}
        className="call-bar__devices"
        onFocus={(e) => (speakFocus.current = !!(e.target as HTMLElement).closest('.call-bar__hand, [data-device="audio"]'))}
      >
        {handForMic ? (
          <HandButton size="sm" place onError={onHandError} className="call-bar__hand" />
        ) : (
          <button
            ref={micButton}
            type="button"
            data-device="audio"
            className={`call-bar__device${me.mic ? ' is-on' : ''}`}
            aria-pressed={me.mic}
            aria-disabled={!canSpeak || undefined}
            aria-busy={busy === 'mic' || undefined}
            aria-label={t('circles.call.mic')}
            aria-describedby={canSpeak ? undefined : 'call-mic-locked'}
            title={canSpeak ? t('circles.call.mic') : t('circles.call.micLocked')}
            onClick={() => canSpeak && void (me.mic ? run('mic', () => setMic(false)) : switchOn('audio'))}
          >
            {me.mic ? <Mic size={20} aria-hidden="true" /> : <MicOff size={20} aria-hidden="true" />}
          </button>
        )}
        {canSpeak || handForMic ? null : <span id="call-mic-locked" className="visually-hidden">{t('circles.call.micLocked')}</span>}
        {videoAllowed ? (
          <>
            <button
              ref={cameraButton}
              type="button"
              data-device="video"
              className={`call-bar__device${me.camera ? ' is-on' : ''}`}
              aria-pressed={me.camera}
              aria-disabled={!canVideo || undefined}
              aria-busy={busy === 'camera' || undefined}
              aria-label={t('circles.call.camera')}
              aria-describedby={canVideo ? undefined : 'call-camera-locked'}
              title={canVideo ? t('circles.call.camera') : t('circles.call.cameraLocked')}
              onClick={() => canVideo && void (me.camera ? run('camera', () => setCamera(false)) : switchOn('video'))}
            >
              {me.camera ? <Video size={20} aria-hidden="true" /> : <VideoOff size={20} aria-hidden="true" />}
            </button>
            {canVideo ? null : <span id="call-camera-locked" className="visually-hidden">{t('circles.call.cameraLocked')}</span>}
          </>
        ) : null}
        {handForMic ? null : <HandButton size="sm" place onError={onHandError} className="call-bar__hand" />}
        {showReactions && compact ? (
          <button
            ref={trayToggle}
            type="button"
            className={`call-bar__react-toggle${trayOpen ? ' is-on' : ''}`}
            aria-expanded={trayOpen}
            aria-controls={trayId}
            aria-label={t('circles.call.react')}
            title={t('circles.call.react')}
            onClick={() => setTray((open) => !open)}
          >
            <SmilePlus size={20} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {/* On a computer the six reactions sit in the bar; on a phone they open as a row above it and stay open for more taps. */}
      {showReactions && (!compact || trayOpen) ? (
        <div id={trayId} className={compact ? 'call-bar__tray' : 'call-bar__reactions'} onKeyDown={compact ? closeTray : undefined}>
          <ReactionBar className="call-bar__reaction-bar" />
        </div>
      ) : null}
      {showReactions ? <CallReactions /> : null}
      <p className="visually-hidden" aria-live="polite">{announcement}</p>
    </>
  )
}
