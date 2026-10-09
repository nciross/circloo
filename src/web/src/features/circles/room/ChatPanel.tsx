import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, Flag } from 'lucide-react'
import { Character } from '../../../components/Character'
import { Panda } from '../../../components/Panda'
import type { Member, Message } from '../../../api/circles'
import { useReducedMotion } from '../../../lib/motion'
import { useRoom } from '../room'
import { AiMessage, ChatGroup, LiveLineRow, RepliedLine, SystemLine } from './ChatMessage'
import { ChatComposer, type ReplyTarget } from './ChatComposer'
import { RoomSettings } from './RoomSettings'
import { groupMessages, threadsOf, worthSaying } from './grouping'
import { isolate } from './liveLines'
import { useChatAnnouncement } from './useChatAnnouncement'

/** Closer than this to the end, the reader follows the conversation; further up, they are reading older messages. */
const AT_END = 48

/** How long a message reached from a "replied" line stays marked. */
const FOUND_MS = 2000

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
 * - Reply (spec 009 US5 #2): the answer sits under the message in a one-level thread; the composer says who you are
 *   answering until you send or cancel. A reply far from its message also leaves a short line where it happened.
 * - Live lines (spec 009 US5 #3): the call and hands as small lines, made here and never stored.
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
  const allLines = useRoom((s) => s.lines)
  const chatMode = useRoom((s) => s.settings.chat)
  const reduced = useReducedMotion()
  const isAnimator = me?.role === 'animator'
  const meId = me?.id
  const shown = useMemo(() => messages.filter((m) => m.activityId === activityId), [messages, activityId])
  const lines = useMemo(() => allLines.filter((l) => l.activityId === activityId), [allLines, activityId])
  const items = useMemo(() => groupMessages(shown, undefined, lines), [shown, lines])
  const threads = useMemo(() => threadsOf(shown), [shown])
  const byId = useMemo(() => new Map(shown.map((m) => [m.id, m])), [shown])
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? ''
  const typists = typing.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => !!m && m.id !== meId)
  const said = useChatAnnouncement(shown)
  const [actionError, setActionError] = useState<string | null>(null)
  // The message being answered. Participants cannot answer while the chat is paused for them.
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  const canWrite = isAnimator || chatMode !== 'paused'
  const startReply = useCallback((m: Message) => {
    setReplyTo({ id: m.id, name: members.find((x) => x.id === m.memberId)?.name ?? '', mine: m.memberId === meId, text: m.text })
  }, [members, meId])
  // The message went (hidden for the circle) or the chat paused: the answer goes out as a new message, and you are told.
  const replyGone = replyTo !== null && (!byId.has(replyTo.id) || !!byId.get(replyTo.id)?.hidden || !canWrite)
  if (replyGone) {
    setReplyTo(null)
    if (canWrite) setActionError(t('circles.chat.reply.gone'))
  }
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

  // Only the reader leaves the end, by scrolling up. Content or room arriving in the same frame (a live line and the
  // call's notice bar together) can make a scroll event see the end out of reach for a moment: that is not leaving it.
  const lastTop = useRef(0)
  const onScroll = () => {
    const el = logRef.current
    if (!el) return
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < AT_END
    const up = el.scrollTop < lastTop.current - 1
    lastTop.current = el.scrollTop
    if (atEnd) {
      if (following.current) return
      following.current = true
      setMark(null)
    } else if (following.current && up) {
      following.current = false
      setMark(lastIdRef.current)
    } else if (following.current) {
      toEnd()
    }
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
    setReplyTo(null)
  }

  // A "replied" line takes you to the reply in its thread, marked for a moment; reading there is reading older messages.
  const found = useRef<{ el: HTMLElement; timer: number } | null>(null)
  const showMessage = (id: number) => {
    const el = logRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)
    if (!el) return
    if (found.current) {
      window.clearTimeout(found.current.timer)
      found.current.el.classList.remove('is-found')
    }
    // Focus follows the reader there, so the keyboard goes on from the reply.
    el.tabIndex = -1
    el.classList.add('is-found')
    found.current = { el, timer: window.setTimeout(() => el.classList.remove('is-found'), FOUND_MS) }
    el.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    el.focus({ preventScroll: true })
  }
  useEffect(() => () => window.clearTimeout(found.current?.timer), [])

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
              : item.kind === 'live' ? <LiveLineRow key={item.key} line={item.line} members={members} meId={meId} />
              : item.kind === 'replied' ? (
                <RepliedLine key={item.key} message={item.message} parentName={nameOf(byId.get(item.message.replyToId ?? 0)?.memberId ?? null)}
                  members={members} meId={meId} onShow={showMessage} />
              )
              : <ChatGroup key={item.key} item={item} members={members} meId={meId} isAnimator={isAnimator} onError={setActionError}
                  onReply={canWrite ? startReply : undefined} threads={threads} />,
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
      <ChatComposer onSent={sent} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
      <p className="visually-hidden" role="status" data-slot="chat-say">{said}</p>
    </section>
  )
}
