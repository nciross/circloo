import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle, Pause, Timer } from 'lucide-react'
import type { RoomSettings as Settings } from '../../../api/circles'
import { Segmented } from '../../../components/Segmented'
import { hubCode, useRoom } from '../room'
import { chatError } from './grouping'

type ChatMode = Settings['chat']

/**
 * The animator's switches for the live room (spec 008 US3 and US4, T806): the chat open, in slow mode or paused, and
 * reactions on or off. In the presenter view both are shown; beside a chat the reactions switch is left out (they only
 * run during a presentation). The hub stores them and sends them to everyone, this tab included: what is shown is the
 * hub's answer, never a guess. Pirikoo's quiet setting is passed through untouched.
 */
export function RoomSettings({ reactions = true, compact = false, className }: { reactions?: boolean; compact?: boolean; className?: string }) {
  const { t } = useTranslation()
  const settings = useRoom((s) => s.settings)
  const [busy, setBusy] = useState<'chat' | 'reactions' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const chatHelp = useId()
  const reactionsHelp = useId()
  const titleId = useId()

  const change = async (which: 'chat' | 'reactions', next: Settings) => {
    if (busy) return
    setBusy(which)
    setError(null)
    try {
      await useRoom.getState().setRoomSettings(next)
    } catch (e) {
      setError(chatError(t, hubCode(e)))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={['room-settings', compact ? 'is-compact' : '', className].filter(Boolean).join(' ')} aria-labelledby={titleId} data-chat={settings.chat}>
      <h3 id={titleId} className={compact ? 'visually-hidden' : 'room-settings__title'}>{reactions ? t('circles.chat.settings.title') : t('circles.chat.settings.chatTitle')}</h3>
      <Segmented<ChatMode>
        label={t('circles.chat.settings.chat')}
        hideLabel
        className="room-settings__chat"
        describedBy={chatHelp}
        value={settings.chat}
        onChange={(chat) => {
          if (chat !== settings.chat) void change('chat', { ...settings, chat })
        }}
        choices={[
          { value: 'open', label: t('circles.chat.settings.open'), icon: <MessageCircle size={15} /> },
          { value: 'slow', label: t('circles.chat.settings.slow'), icon: <Timer size={15} /> },
          { value: 'paused', label: t('circles.chat.settings.paused'), icon: <Pause size={15} /> },
        ]}
      />
      {/* Beside the chat the open state needs no words: the help appears once participants are limited. */}
      <p id={chatHelp} className={compact && settings.chat === 'open' ? 'visually-hidden' : 'field__help room-settings__help'}>{t(`circles.chat.settings.${settings.chat}Help`)}</p>
      {reactions ? (
        <div className="room-settings__toggle">
          <button
            type="button"
            role="switch"
            className="switch"
            data-setting="reactions"
            aria-checked={settings.reactions}
            aria-busy={busy === 'reactions' || undefined}
            aria-describedby={reactionsHelp}
            onClick={() => void change('reactions', { ...settings, reactions: !settings.reactions })}
          >
            <span className="switch__track" aria-hidden="true"><span className="switch__knob" /></span>
            {t('circles.chat.settings.reactions')}
          </button>
          <p id={reactionsHelp} className="field__help room-settings__help">
            {settings.reactions ? t('circles.chat.settings.reactionsOn') : t('circles.chat.settings.reactionsOff')}
          </p>
        </div>
      ) : null}
      {error ? <p className="field__error" role="alert">{error}</p> : null}
    </section>
  )
}
