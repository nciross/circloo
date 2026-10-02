import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Flag } from 'lucide-react'
import { Character } from '../../components/Character'
import { Panda } from '../../components/Panda'
import { Segmented } from '../../components/Segmented'
import type { Member, Message } from '../../api/circles'
import { activityById } from './catalog'
import { useRoom } from './room'

const MESSAGE_MAX = 280
const ASK_MAX = 400

function SystemLine({ message, members }: { message: Message; members: Member[] }) {
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

function AiMessage({ text, live = false }: { text: string; live?: boolean }) {
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

/** The activity's conversation: everyone talks; the animator also talks to circloo, whose reply streams in. */
export function Chat({ activityId }: { activityId: string }) {
  const { t } = useTranslation()
  const { me, members, messages, thinking, draft, say, ask, end, error, clearError } = useRoom()
  const isAnimator = me?.role === 'animator'
  const [to, setTo] = useState<'circloo' | 'everyone'>(isAnimator ? 'circloo' : 'everyone')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const errorId = useId()
  const max = to === 'circloo' ? ASK_MAX : MESSAGE_MAX
  const shown = messages.filter((m) => m.activityId === activityId)
  const suggestions = t('circles.room.quick', { returnObjects: true }) as string[]

  // Follow the conversation unless the reader scrolled up.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight
  }, [shown.length, draft, thinking])

  const send = async (value: string) => {
    const clean = value.trim()
    if (!clean || clean.length > max || sending) return
    setSending(true)
    clearError()
    try {
      if (isAnimator && to === 'circloo') await ask(clean)
      else await say(clean)
      setText('')
    } catch {
      // The room store holds the error code; the field keeps the text so nothing is lost.
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(text)
    }
  }

  const title = t(`activities.${activityId}.title`)
  return (
    <section className="panel chat" aria-labelledby="chat-title">
      <div className="panel__head">
        <h2 id="chat-title" className="panel__title">{title}</h2>
        {isAnimator ? (
          <button type="button" className="btn btn--subtle btn--sm" onClick={() => void end()}>
            <span className="btn__icon" aria-hidden="true"><Flag size={14} /></span>
            <span className="btn__label">{t('circles.room.end')}</span>
          </button>
        ) : null}
      </div>

      <div ref={listRef} className="chat__log" role="log" aria-live="polite" aria-label={t('circles.room.conversation')} tabIndex={0}>
      <ol className="chat__list">
        {shown.map((m) => {
          if (m.kind === 'system') return <SystemLine key={m.id} message={m} members={members} />
          if (m.kind === 'ai') return <AiMessage key={m.id} text={m.text} />
          const who = members.find((x) => x.id === m.memberId)
          const mine = m.memberId === me?.id
          return (
            <li key={m.id} className={`chat__msg${mine ? ' is-mine' : ''}${who?.role === 'animator' ? ' is-animator' : ''}`}>
              {who ? <Character id={who.character} className="chat__avatar" /> : null}
              <div className="chat__bubble">
                <span className="chat__name"><bdi>{who?.name ?? '…'}</bdi></span>
                <p className="chat__text" dir="auto">{m.text}</p>
              </div>
            </li>
          )
        })}
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
      </div>

      <form className="composer" onSubmit={submit} data-perch="composer">
        {isAnimator ? (
          <div className="composer__top">
            <Segmented<'circloo' | 'everyone'>
              label={t('circles.room.to')}
              value={to}
              onChange={setTo}
              choices={[{ value: 'circloo', label: t('circles.room.toCircloo') }, { value: 'everyone', label: t('circles.room.toEveryone') }]}
            />
            {to === 'circloo' ? (
              <ul className="composer__chips" aria-label={t('circles.room.quickLabel')}>
                {suggestions.map((s) => (
                  <li key={s}><button type="button" className="chip" disabled={thinking} onClick={() => void send(s)}>{s}</button></li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="composer__box">
          <label className="visually-hidden" htmlFor="composer-input">
            {isAnimator && to === 'circloo' ? t('circles.room.askLabel') : t('circles.room.sayLabel')}
          </label>
          <textarea
            id="composer-input"
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={max}
            dir="auto"
            onChange={(e) => { setText(e.target.value); if (error) clearError() }}
            onKeyDown={onKeyDown}
            placeholder={isAnimator && to === 'circloo' ? t('circles.room.askPlaceholder') : t('circles.room.sayPlaceholder')}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <button
            type="submit"
            className={`composer__send${isAnimator && to === 'circloo' ? ' is-ai' : ''}`}
            aria-label={t('circles.room.send')}
            aria-disabled={!text.trim() || sending || (to === 'circloo' && thinking) || undefined}
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        </div>
        {error ? <p id={errorId} className="field__error" role="alert">{t(`circles.errors.${error}`, { defaultValue: t('circles.errors.failed') })}</p> : null}
      </form>
    </section>
  )
}
