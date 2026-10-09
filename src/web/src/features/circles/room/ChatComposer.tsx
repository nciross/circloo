import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Pause, Reply, Timer, X } from 'lucide-react'
import { Segmented } from '../../../components/Segmented'
import { hubCode, useRoom } from '../room'
import { SLOW_EVERY_S, chatError, slowModeSeconds } from './grouping'
import { isolate } from './liveLines'

const MESSAGE_MAX = 280
const ASK_MAX = 400

/** The message being answered, as the composer shows it. */
export interface ReplyTarget {
  id: number
  /** The sender's name; empty when they are no longer in the circle. */
  name: string
  mine: boolean
  text: string
}

/** The start of the message being answered, on one line. */
const QUOTE_MAX = 80
const quote = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX - 1).trimEnd()}…` : flat
}

/** A moment some seconds from now (ms). */
const secondsFromNow = (seconds: number) => Date.now() + seconds * 1000

/**
 * Whole seconds of slow mode left until `until` (ms), checked a few times a second; zero once it has passed. A clock
 * behind the server's never makes the wait longer than one full slow-mode wait.
 */
function useSlowWait(until: number): number {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    const end = Math.min(until, secondsFromNow(SLOW_EVERY_S))
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) window.clearInterval(timer)
    }
    const timer = window.setInterval(tick, 250)
    const first = window.setTimeout(tick, 0)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(first)
    }
  }, [until])
  return left
}

/**
 * Where you write (spec 008 US3). Everyone talks to the circle; the animator can also ask circloo. When the animator
 * pauses the chat, participants read on and see why they cannot write; the animator always writes. In slow mode a
 * participant sees the rule, then the seconds left after each message. Text being written is never lost: a pause keeps
 * it until the chat opens again, a refusal leaves it in the field.
 * With `replyTo` it answers that message (spec 009 US5 #2): "Replying to Amina" above the field with Cancel (or Escape),
 * and the field takes the focus. A reply always goes to the circle, never to circloo.
 */
export function ChatComposer({ onSent, replyTo = null, onCancelReply }: {
  onSent: () => void
  replyTo?: ReplyTarget | null
  onCancelReply?: () => void
}) {
  const { t } = useTranslation()
  const isAnimator = useRoom((s) => s.me?.role === 'animator')
  const mode = useRoom((s) => s.settings.chat)
  const thinking = useRoom((s) => s.thinking)
  const error = useRoom((s) => s.error)
  // Slow mode counts from your last stored message, whatever the round (contracts/hub.md).
  const lastMineAt = useRoom((s) => {
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const m = s.messages[i]!
      if (m.kind === 'member' && m.memberId === s.me?.id) return m.at
    }
    return null
  })
  const [to, setTo] = useState<'circloo' | 'everyone'>(isAnimator ? 'circloo' : 'everyone')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [waitUntil, setWaitUntil] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const errorId = useId()
  const modeId = useId()
  const replyId = useId()
  const replying = replyTo !== null
  const asking = isAnimator && to === 'circloo' && !replying
  const max = asking ? ASK_MAX : MESSAGE_MAX
  const limited = !isAnimator && mode === 'slow'
  const paused = !isAnimator && mode === 'paused'
  const suggestions = t('circles.room.quick', { returnObjects: true }) as string[]

  // The wait runs from your last message (a reload, or slow mode switched on just after it, included), or from what
  // the hub said when it refused one.
  const fromLast = lastMineAt ? Date.parse(lastMineAt) + SLOW_EVERY_S * 1000 : 0
  const left = useSlowWait(limited ? Math.max(waitUntil, Number.isFinite(fromLast) ? fromLast : 0) : 0)
  const waiting = limited && left > 0

  // Choosing Reply (or another message to answer) puts you in the field, writing to the circle from then on.
  const replyKey = replyTo?.id ?? null
  const [answering, setAnswering] = useState<number | null>(null)
  if (replyKey !== answering) {
    setAnswering(replyKey)
    if (replyKey !== null) setTo('everyone')
  }
  useEffect(() => {
    if (replyKey !== null) inputRef.current?.focus()
  }, [replyKey])

  const cancelReply = () => {
    onCancelReply?.()
    inputRef.current?.focus()
  }

  const send = async (value: string) => {
    const clean = value.trim()
    if (!clean || clean.length > max || sending || paused || (waiting && !asking)) return
    setSending(true)
    useRoom.getState().clearError()
    try {
      if (asking) await useRoom.getState().ask(clean)
      else if (replyTo) await useRoom.getState().reply(replyTo.id, clean)
      else await useRoom.getState().say(clean)
      setText('')
      onSent()
    } catch (e) {
      // Slow mode refused it: the countdown says it, not an error. Other codes stay in the room's error line.
      const code = hubCode(e)
      const seconds = slowModeSeconds(code)
      if (seconds !== null) {
        setWaitUntil(secondsFromNow(seconds))
        useRoom.getState().clearError()
      }
      // The message cannot be answered any more: the error says so and the text waits to go out as a new message.
      if (code === 'reply-invalid') onCancelReply?.()
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void send(text)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && replying && !e.nativeEvent.isComposing) {
      e.preventDefault()
      cancelReply()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(text)
    }
  }

  if (paused) {
    return (
      <div className="composer composer--paused" data-perch="composer" data-chat="paused">
        <div className="composer__paused" role="status">
          <Pause size={18} aria-hidden="true" className="composer__paused-icon" />
          <p>
            <strong>{t('circles.chat.pausedTitle')}</strong>
            <span>{t('circles.chat.pausedBody')}</span>
          </p>
        </div>
      </div>
    )
  }

  const note =
    limited ? (waiting ? t('circles.chat.slowWait', { count: left }) : t('circles.chat.slowRule', { count: SLOW_EVERY_S }))
    : isAnimator && mode === 'paused' ? t('circles.chat.pausedAnimator')
    : isAnimator && mode === 'slow' ? t('circles.chat.slowAnimator', { count: SLOW_EVERY_S })
    : null
  const blocked = !text.trim() || sending || (asking && thinking) || (waiting && !asking)
  const describedBy = [replying ? replyId : null, note ? modeId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  const replyingTo = replyTo ? (replyTo.mine ? t('circles.chat.reply.replyingToMine') : t('circles.chat.reply.replyingTo', { name: isolate(replyTo.name || '…') })) : ''

  return (
    <form className="composer" onSubmit={submit} data-perch="composer" data-chat={mode}>
      {isAnimator ? (
        <div className="composer__top">
          <Segmented<'circloo' | 'everyone'>
            label={t('circles.room.to')}
            value={replying ? 'everyone' : to}
            onChange={(next) => {
              // Asking circloo is not an answer to someone: it leaves the reply.
              if (next === 'circloo' && replying) onCancelReply?.()
              setTo(next)
            }}
            choices={[{ value: 'circloo', label: t('circles.room.toCircloo') }, { value: 'everyone', label: t('circles.room.toEveryone') }]}
          />
          {asking ? (
            <ul className="composer__chips" aria-label={t('circles.room.quickLabel')}>
              {suggestions.map((s) => (
                <li key={s}><button type="button" className="chip" disabled={thinking} onClick={() => void send(s)}>{s}</button></li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {note ? (
        <p id={modeId} className={`composer__mode${waiting ? ' is-waiting' : ''}`}>
          {mode === 'paused' ? <Pause size={14} aria-hidden="true" /> : <Timer size={14} aria-hidden="true" />}
          <span>{note}</span>
        </p>
      ) : null}
      {replyTo ? (
        <div className="composer__reply">
          <Reply size={16} aria-hidden="true" className="composer__reply-icon flip-rtl" />
          <p id={replyId} className="composer__reply-text">
            <span className="composer__reply-to">{replyingTo}</span>
            <span className="composer__reply-quote" dir="auto">{quote(replyTo.text)}</span>
          </p>
          <button type="button" className="icon-btn composer__reply-cancel" aria-label={t('circles.chat.reply.cancel')} title={t('circles.chat.reply.cancel')} onClick={cancelReply}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="composer__box">
        <label className="visually-hidden" htmlFor="composer-input">
          {asking ? t('circles.room.askLabel') : replying ? t('circles.chat.reply.label') : t('circles.room.sayLabel')}
        </label>
        <textarea
          id="composer-input"
          ref={inputRef}
          rows={1}
          value={text}
          maxLength={max}
          dir="auto"
          onChange={(e) => {
            setText(e.target.value)
            if (error) useRoom.getState().clearError()
            if (e.target.value.trim()) useRoom.getState().notifyTyping()
          }}
          onKeyDown={onKeyDown}
          placeholder={asking ? t('circles.room.askPlaceholder') : replying ? t('circles.chat.reply.placeholder') : t('circles.room.sayPlaceholder')}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <button
          type="submit"
          className={`composer__send${asking ? ' is-ai' : ''}`}
          aria-label={t('circles.room.send')}
          aria-disabled={blocked || undefined}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </div>
      {error ? <p id={errorId} className="field__error" role="alert">{chatError(t, error)}</p> : null}
    </form>
  )
}
