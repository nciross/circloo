import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Heart } from 'lucide-react'
import type { Member, Message } from '../../../api/circles'
import { Character } from '../../../components/Character'
import { Panda } from '../../../components/Panda'
import { activityById } from '../catalog'
import { hubCode, useRoom } from '../room'
import { chatError, type ChatItem } from './grouping'

/** "Amina started Brainstorm": a line between the messages, not a message. */
export function SystemLine({ message, members }: { message: Message; members: Member[] }) {
  const { t } = useTranslation()
  const [verb, activityId] = message.text.split(':')
  const who = members.find((m) => m.id === message.memberId)?.name ?? ''
  const title = activityById(activityId) ? t(`activities.${activityId}.title`) : ''
  return (
    <li className="chat__system">
      <span>{verb === 'start' ? t('circles.room.started', { name: who, activity: title }) : t('circles.room.ended', { name: who, activity: title })}</span>
    </li>
  )
}

/** circloo's answer to the animator, labelled AI; `live` while it streams in. */
export function AiMessage({ text, live = false }: { text: string; live?: boolean }) {
  const { t } = useTranslation()
  return (
    <li className={`chat__ai${live ? ' is-live' : ''}`}>
      <div className="chat__who">
        <Panda thinking={live} className="chat__panda" />
        <span className="chat__name">circloo</span>
        <span className="lozenge lozenge--ai">{t('ice.ask.aiLabel')}</span>
      </div>
      <p className="chat__text" dir="auto">{text}{live ? <span className="chat__caret" aria-hidden="true" /> : null}</p>
    </li>
  )
}

type OnError = (message: string) => void

/**
 * One sender's consecutive messages (spec 008 US3 #6): their character with its ring and their name once, then each
 * message. Yours sit at the inline end without a name. The animator is named in words, not by a symbol.
 */
export function ChatGroup({ item, members, meId, isAnimator, onError }: {
  item: Extract<ChatItem, { kind: 'group' }>
  members: Member[]
  meId: string | undefined
  isAnimator: boolean
  onError: OnError
}) {
  const { t } = useTranslation()
  const who = members.find((m) => m.id === item.memberId)
  const mine = !!meId && item.memberId === meId
  const animator = who?.role === 'animator'
  return (
    <li className={`chat__group${mine ? ' is-mine' : ''}${animator ? ' is-animator' : ''}`}>
      {mine ? null : who ? <Character id={who.character} ring={who.ring} tag={false} className="chat__avatar" /> : <span className="chat__avatar" aria-hidden="true" />}
      <div className="chat__stack">
        {mine ? (
          <span className="visually-hidden">{t('circles.chat.you')}</span>
        ) : (
          <p className="chat__from">
            <span className="chat__name"><bdi>{who?.name ?? '…'}</bdi></span>
            {animator ? <span className="lozenge chat__role">{t('circles.roles.animator')}</span> : null}
          </p>
        )}
        <ol className="chat__lines">
          {item.messages.map((m) => (
            <ChatLine key={m.id} message={m} name={who?.name ?? ''} mine={mine} isAnimator={isAnimator} onError={onError} />
          ))}
        </ol>
      </div>
    </li>
  )
}

/** One message: the bubble, then its likes and, for the animator, hide or show again. */
function ChatLine({ message: m, name, mine, isAnimator, onError }: { message: Message; name: string; mine: boolean; isAnimator: boolean; onError: OnError }) {
  const { t } = useTranslation()
  const canHide = isAnimator && !mine
  return (
    <li className={`chat__msg${m.hidden ? ' is-hidden' : ''}`} data-id={m.id}>
      <div className="chat__bubble">
        {m.hidden ? (
          <span className="chat__hidden-tag">
            <EyeOff size={13} aria-hidden="true" />
            {t('circles.chat.hiddenTag')}
          </span>
        ) : null}
        <p className="chat__text" dir="auto">{m.text}</p>
      </div>
      <div className="chat__acts">
        {mine || m.hidden ? <LikeCount count={m.likes} /> : <LikeButton message={m} name={name} onError={onError} />}
        {canHide ? <HideButton message={m} name={name} onError={onError} /> : null}
      </div>
    </li>
  )
}

/** The likes on your own message (or a hidden one): read only, nothing when there are none. */
function LikeCount({ count }: { count: number }) {
  const { t } = useTranslation()
  if (count <= 0) return null
  return (
    <span className="chat__likes">
      <Heart size={14} aria-hidden="true" fill="currentColor" />
      <span aria-hidden="true">{count}</span>
      <span className="visually-hidden">{t('circles.chat.likes', { count })}</span>
    </span>
  )
}

/**
 * Like or take your like back. "You liked" is told by the filled heart and the visible word "Liked", never by colour
 * alone; the count follows. The hub's answer (`MyLike`, then the count) changes the button, never a guess.
 */
function LikeButton({ message: m, name, onError }: { message: Message; name: string; onError: OnError }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await useRoom.getState().likeMessage(m.id)
    } catch (e) {
      onError(chatError(t, hubCode(e)))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      className="chat__like"
      aria-pressed={m.liked}
      aria-busy={busy || undefined}
      title={m.liked ? t('circles.chat.unlikeHint', { name }) : t('circles.chat.likeHint', { name })}
      onClick={() => void toggle()}
    >
      <Heart size={14} aria-hidden="true" fill={m.liked ? 'currentColor' : 'none'} />
      <span className={m.liked ? 'chat__like-label' : 'visually-hidden'}>{m.liked ? t('circles.chat.liked') : t('circles.chat.like')}</span>
      {m.likes > 0 ? (
        <>
          <span className="chat__like-count" aria-hidden="true">{m.likes}</span>
          <span className="visually-hidden">{t('circles.chat.likes', { count: m.likes })}</span>
        </>
      ) : null}
    </button>
  )
}

/** The animator hides a message from everyone else (spec 008 US3 #7), or shows it again; theirs stays, marked. */
function HideButton({ message: m, name, onError }: { message: Message; name: string; onError: OnError }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await useRoom.getState().hideMessage(m.id, !m.hidden)
    } catch (e) {
      onError(chatError(t, hubCode(e)))
    } finally {
      setBusy(false)
    }
  }
  return m.hidden ? (
    <button type="button" className="chat__hide is-hidden" aria-busy={busy || undefined} onClick={() => void toggle()}>
      <Eye size={14} aria-hidden="true" />
      <span>{t('circles.chat.unhide')}</span>
    </button>
  ) : (
    <button type="button" className="chat__hide" aria-busy={busy || undefined} aria-label={t('circles.chat.hide', { name })} title={t('circles.chat.hide', { name })} onClick={() => void toggle()}>
      <EyeOff size={14} aria-hidden="true" />
    </button>
  )
}
