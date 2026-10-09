import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, Flag } from 'lucide-react'
import { Character } from '../../../components/Character'
import { Panda } from '../../../components/Panda'
import type { Member } from '../../../api/circles'
import { useReducedMotion } from '../../../lib/motion'
import { useRoom } from '../room'
import { AiMessage, ChatGroup, SystemLine } from './ChatMessage'
import { ChatComposer } from './ChatComposer'
import { RoomSettings } from './RoomSettings'
import { groupMessages, worthSaying } from './grouping'
import { useChatAnnouncement } from './useChatAnnouncement'

/** Closer than this to the end, the reader follows the conversation; further up, they are reading older messages. */
const AT_END = 48

// Names keep their own direction inside a sentence in any language.
const isolate = (name: string) => `⁨${name}⁩`

/** "Kenji is typing…", like any instant chat. Hidden from screen readers: it changes too often to announce. */
function TypingLine({ people }: { people: Member[] }) {
  const { t } = useTranslation()
  const [first, second] = people
  if (!first) return null
  const text = !second
    ? t('circles.room.typing.one', { name: isolate(first.name) })
    : people.length === 2
      ? t('circles.room.typing.two', { a: isolate(first.name), b: isolate(second.name) })
      : t('circles.room.typing.many')
  return (
    <div className="chat__typing" aria-hidden="true">
      <span className="chat__typing-faces">
        {people.slice(0, 3).map((m) => <Character key={m.id} id={m.character} ring={m.ring} tag={false} className="chat__typing-face" />)}
      </span>
      <span>{text}</span>
      <span className="typing-dots"><i /><i /><i /></span>
    </div>
  )
}

/**
 * The conversation of a round (spec 008 US3, T806), in the centre for a chat round and in the sidebar beside a board, a
 * canvas or a presentation. Everyone talks; the animator also asks circloo, whose answer streams in.
 * - A sender's consecutive messages are grouped under one name with their character and ring.
 * - Likes on others' messages; the animator hides a message for everyone else, or shows it again.
 * - The animator sets the chat open, slow or paused here (the presenter view has the same switches, with reactions).
 * - The list follows new messages only while you are at the end: reading older ones, nothing moves, and a
 *   "New messages" button takes you down.
 * - Screen readers hear new messages in batches (useChatAnnouncement), never one interruption per message.
 * `hideEnd`: the activity is ended somewhere else (a presentation has its own controls).
 */
export function ChatPanel({ activityId, hideEnd = false }: { activityId: string; hideEnd?: boolean }) {
  const { t } = useTranslation()
  const me = useRoom((s) => s.me)
  const members = useRoom((s) => s.members)
  const messages = useRoom((s) => s.messages)
  const thinking = useRoom((s) => s.thinking)
  const draft = useRoom((s) => s.draft)
  const typing = useRoom((s) => s.typing)
  const reduced = useReducedMotion()
  const isAnimator = me?.role === 'animator'
  const meId = me?.id
  const shown = useMemo(() => messages.filter((m) => m.activityId === activityId), [messages, activityId])
  const items = useMemo(() => groupMessages(shown), [shown])
  const typists = typing.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => !!m && m.id !== meId)
  const said = useChatAnnouncement(shown)
  const [actionError, setActionError] = useState<string | null>(null)
  // A refused like or hide is said once, then leaves.
  useEffect(() => {
    if (!actionError) return
    const timer = window.setTimeout(() => setActionError(null), 6000)
    return () => window.clearTimeout(timer)
  }, [actionError])

  // Following the end, or reading older messages from `mark` (the last message id when the reader scrolled up).
  const logRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const lastId = shown.length ? shown[shown.length - 1]!.id : 0
  const lastIdRef = useRef(lastId)
  useEffect(() => {
    lastIdRef.current = lastId
  }, [lastId])
  const [mark, setMark] = useState<number | null>(null)
  const fresh = mark === null ? 0 : shown.filter((m) => m.id > mark && worthSaying(m, meId)).length

  const toEnd = useCallback((smooth = false) => {
    const el = logRef.current
    if (!el) return
    if (smooth && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
  }, [])

  const onScroll = () => {
    const el = logRef.current
    if (!el) return
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < AT_END
    if (atEnd === following.current) return
    following.current = atEnd
    setMark(atEnd ? null : lastIdRef.current)
  }

  // New content: follow it only at the end. Reading older messages, the list stays where it is.
  useLayoutEffect(() => {
    if (following.current) toEnd()
  }, [items, draft, thinking, typists.length, toEnd])

  // The panel opening (a tab, the sheet) or resizing keeps the end in view when following.
  useEffect(() => {
    const el = logRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (following.current) toEnd()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [toEnd])

  const jump = () => {
    following.current = true
    setMark(null)
    toEnd(!reduced)
    logRef.current?.focus({ preventScroll: true })
  }

  const sent = () => {
    following.current = true
    setMark(null)
    setActionError(null)
  }

  const title = t(`activities.${activityId}.title`)
  return (
    <section className="panel chat" aria-labelledby="chat-title">
      <div className="panel__head">
        <h2 id="chat-title" className="panel__title">{title}</h2>
        {isAnimator && !hideEnd ? (
          <button type="button" className="btn btn--subtle btn--sm" onClick={() => void useRoom.getState().end()}>
            <span className="btn__icon" aria-hidden="true"><Flag size={14} /></span>
            <span className="btn__label">{t('circles.room.end')}</span>
          </button>
        ) : null}
        {isAnimator ? <RoomSettings reactions={false} compact className="chat__settings" /> : null}
      </div>

      <div className="chat__view">
        <div ref={logRef} className="chat__log" role="region" aria-label={t('circles.room.conversation')} tabIndex={0} onScroll={onScroll}>
          <ol className="chat__list">
            {items.map((item) =>
              item.kind === 'system' ? <SystemLine key={item.key} message={item.message} members={members} />
              : item.kind === 'ai' ? <AiMessage key={item.key} text={item.message.text} />
              : <ChatGroup key={item.key} item={item} members={members} meId={meId} isAnimator={isAnimator} onError={setActionError} />,
            )}
            {thinking ? (
              draft ? <AiMessage text={draft} live /> : (
                <li className="chat__ai is-live">
                  <div className="chat__who">
                    <Panda thinking className="chat__panda chat__panda--big" />
                    <span className="chat__name">{t('circles.room.thinking')}</span>
                  </div>
                </li>
              )
            ) : null}
          </ol>
          <TypingLine people={typists} />
        </div>
        {fresh > 0 ? (
          <button type="button" className="chat__jump" onClick={jump}>
            <ArrowDown size={16} aria-hidden="true" />
            {t('circles.chat.newMessages', { count: fresh })}
          </button>
        ) : null}
      </div>

      {actionError ? <p className="field__error chat__action-error" role="alert">{actionError}</p> : null}
      <ChatComposer onSent={sent} />
      <p className="visually-hidden" role="status" data-slot="chat-say">{said}</p>
    </section>
  )
}
