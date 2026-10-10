import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Hand, Mic, MicOff } from 'lucide-react'
import type { DiscussionState } from '../../../api/circles'
import { Segmented } from '../../../components/Segmented'
import { hubCode, useRoom } from '../room'
import { useStage } from './stage'

type Speaking = DiscussionState['speaking']
type Busy = 'chat' | 'audio' | 'video' | 'mode' | 'mute'

/**
 * The animator's switches while the circle is open (spec 009 US1 and US3, T926): Chat (spec 008's room setting, paused
 * means off), Audio call and Video call (video includes the voices: switching video off keeps the call going, switching
 * the call off ends it), and who can speak, Hand to speak or Open mic, chosen before the call and changed during it.
 * In Open mic, Mute everyone switches every microphone off once. Without a call server the call switches are left out
 * and the Call tab says why; the chat switch stays. The server decides who may change anything; this only asks.
 */
export function DiscussionSwitch() {
  const { t } = useTranslation()
  const discussion = useStage((s) => s.discussion)
  const settings = useRoom((s) => s.settings)
  const on = discussion?.on ?? false
  const available = discussion?.available ?? true
  const video = on && (discussion?.videoAllowed ?? false)
  // Before the call the mode waits here and goes with the switch; during the call the server's mode is the one shown.
  const [picked, setPicked] = useState<Speaking>(discussion?.speaking ?? 'hand')
  const speaking: Speaking = on ? (discussion?.speaking ?? 'hand') : picked
  const chatOn = settings.chat !== 'paused'
  const [busy, setBusy] = useState<Busy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState('')
  const modeHelpId = useId()

  const run = async (which: Busy, action: () => Promise<void>, after?: string) => {
    if (busy) return
    setBusy(which)
    setError(null)
    setDone('')
    try {
      await action()
      if (after) setDone(after)
    } catch (e) {
      const code = hubCode(e)
      setError(t(`circles.call.errors.${code}`, { defaultValue: t('circles.call.errors.failed') }))
    } finally {
      setBusy(null)
    }
  }
  const s = () => useStage.getState()

  return (
    <section className="call__switches" aria-labelledby="call-switches-title">
      <h2 id="call-switches-title" className="call__switches-title">{t('circles.call.controlsTitle')}</h2>
      <Toggle
        kind="chat"
        checked={chatOn}
        busy={busy === 'chat'}
        label={t('circles.call.chatSwitch')}
        help={t('circles.call.chatHelp')}
        onToggle={() => void run('chat', () => useRoom.getState().setRoomSettings({ ...settings, chat: chatOn ? 'paused' : 'open' }))}
      />
      {available ? (
        <>
          <Toggle
            kind="audio"
            checked={on}
            busy={busy === 'audio'}
            label={t('circles.call.audioSwitch')}
            help={on ? t('circles.call.audioHelpOn') : t('circles.call.audioHelpOff')}
            onToggle={() => void run('audio', () => (on ? s().disableDiscussion() : s().enableDiscussion(false, speaking)))}
          />
          <Toggle
            kind="video"
            checked={video}
            busy={busy === 'video'}
            label={t('circles.call.videoSwitch')}
            help={video ? t('circles.call.videoHelpOn') : on ? t('circles.call.videoHelpAudio') : t('circles.call.videoHelpOff')}
            onToggle={() => void run('video', () => s().enableDiscussion(!video, speaking))}
          />
          <div className="call__mode-pick">
            <Segmented<Speaking>
              label={t('circles.call.mode.label')}
              className="call__mode-seg"
              describedBy={modeHelpId}
              value={speaking}
              onChange={(mode) => {
                if (mode === speaking) return
                if (on) void run('mode', () => s().setSpeakingMode(mode))
                else setPicked(mode)
              }}
              choices={[
                { value: 'hand', label: t('circles.call.mode.hand'), icon: <Hand size={16} /> },
                { value: 'open', label: t('circles.call.mode.open'), icon: <Mic size={16} /> },
              ]}
            />
            <p id={modeHelpId} className="field__help">{speaking === 'open' ? t('circles.call.mode.openHelp') : t('circles.call.mode.handHelp')}</p>
            {on && speaking === 'open' ? (
              <button
                type="button"
                className="btn btn--default btn--sm call__mute-all"
                aria-busy={busy === 'mute' || undefined}
                aria-describedby="call-mute-all-help"
                onClick={() => void run('mute', () => s().muteEveryone(), t('circles.call.muteAllDone'))}
              >
                <MicOff size={16} aria-hidden="true" />
                {t('circles.call.muteAll')}
              </button>
            ) : null}
            {on && speaking === 'open' ? <p id="call-mute-all-help" className="field__help">{t('circles.call.muteAllHelp')}</p> : null}
          </div>
        </>
      ) : null}
      {error ? <p className="field__error call__switch-error" role="alert">{error}</p> : null}
      <p className="visually-hidden" aria-live="polite">{done}</p>
    </section>
  )
}

function Toggle({ kind, checked, busy, label, help, onToggle }: {
  kind: 'chat' | 'audio' | 'video'
  checked: boolean
  busy: boolean
  label: string
  help: string
  onToggle: () => void
}) {
  const helpId = useId()
  return (
    <div className="call__toggle">
      <button
        type="button"
        role="switch"
        className="switch"
        data-switch={kind}
        aria-checked={checked}
        aria-busy={busy || undefined}
        aria-describedby={helpId}
        onClick={onToggle}
      >
        <span className="switch__track" aria-hidden="true"><span className="switch__knob" /></span>
        {label}
      </button>
      <p id={helpId} className="field__help">{help}</p>
    </div>
  )
}
