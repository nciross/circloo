import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { ArrowUp, Maximize2, Minimize2, RotateCcw, Square, X } from 'lucide-react'
import { useMe } from '../../api/hooks'
import type { PirikooPage } from '../../api/pirikoo'
import { isLocale } from '../../i18n'
import { moodOf, usePirikoo, type AskContext, type ChatItem } from '../../stores/pirikoo'
import { useUiStore } from '../../stores/ui'
import { useRoom } from '../circles/room'
import { Bird } from './Bird'
import { PlanCard } from './plan'
import { isQuestion, planFor, useRunPlan } from './planning'
import { useTip, type Tip } from './tips'
import '../../styles/pirikoo.css'

const MESSAGE_MAX = 600
const CIRCLE_PATH = /^\/(?:app\/circles|c)\/([0-9a-f-]{36})$/
const DONE_KEY = 'circloo-pirikoo-done'

function pageOf(pathname: string): PirikooPage {
  if (pathname === '/app') return 'home'
  if (pathname === '/app/circles/new') return 'create'
  if (pathname.startsWith('/app/icebreakers')) return 'icebreakers'
  if (pathname.startsWith('/app/integrations')) return 'integrations'
  if (pathname.startsWith('/app/settings')) return 'settings'
  return 'other'
}

/** Where the person is: sent with each question so the answer fits the page (circle facts are checked server side). */
function useAskContext(): AskContext {
  const { i18n } = useTranslation()
  const { pathname } = useLocation()
  const circleId = CIRCLE_PATH.exec(pathname)?.[1] ?? null
  return { lang: isLocale(i18n.language) ? i18n.language : 'en', page: circleId ? 'circle' : pageOf(pathname), circleId }
}

function readDone(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DONE_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function markDone(id: string) {
  try {
    sessionStorage.setItem(DONE_KEY, JSON.stringify([...readDone(), id].slice(-200)))
  } catch {
    // Private mode: a suggestion may come back, nothing worse.
  }
}

/**
 * Pirikoo, the parakeet guide, as a conversation: a button in the bottom corner that opens a compact chat,
 * which grows into a centred conversation (also Ctrl/⌘ K). Questions get streamed answers; plain instructions
 * become a plan the person checks and runs. Suggestions for the next step pop up from the button.
 */
export function PirikooChat({ owner, guest = false }: { owner: string | null; guest?: boolean }) {
  const mode = usePirikoo((s) => s.mode)

  useEffect(() => {
    if (owner) usePirikoo.getState().bind(owner)
  }, [owner])

  // Ctrl/⌘ K opens the conversation in the middle of the screen from anywhere.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      // By key position too, so it works with any keyboard layout (Arabic, AZERTY…).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        usePirikoo.getState().open('center')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <Launcher />
      {mode === 'panel' ? <Panel guest={guest} /> : null}
      {mode === 'center' ? <Center guest={guest} /> : null}
    </>
  )
}

/** The bird in the corner: opens the chat, shows what Pirikoo is doing, and offers the next step. */
function Launcher() {
  const { t } = useTranslation()
  const mode = usePirikoo((s) => s.mode)
  const unread = usePirikoo((s) => s.unread)
  const mood = usePirikoo(moodOf)
  const enabled = useUiStore((s) => s.autonomy === 'suggest')
  const setAutonomy = useUiStore((s) => s.setAutonomy)
  const tip = useTip()
  const [shown, setShown] = useState<Tip | null>(null)
  const [done, setDone] = useState(readDone)
  const [acting, setActing] = useState(false)

  const nextId = enabled && mode === 'closed' && tip && !done.includes(tip.id) ? tip.id : null
  useEffect(() => {
    if (!nextId) {
      setShown(null)
      return
    }
    if (shown?.id === nextId) return
    // A new suggestion after a breath, with a little hop to catch the eye.
    const wait = window.setTimeout(() => {
      setShown(tip)
      usePirikoo.getState().cheer()
    }, shown ? 300 : 1400)
    return () => window.clearTimeout(wait)
    // Only the identity of the suggestion matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextId])

  // Keep the words current (counts, names) without popping up again.
  useEffect(() => {
    if (tip && shown && tip.id === shown.id && tip.text !== shown.text) setShown(tip)
  }, [tip, shown])

  // Point at the thing the suggestion is about.
  useEffect(() => {
    if (!shown?.perch) return
    const el = document.querySelector<HTMLElement>(`[data-perch="${shown.perch}"]`)
    el?.setAttribute('data-pirikoo-spot', '')
    return () => el?.removeAttribute('data-pirikoo-spot')
  }, [shown?.perch])

  const dismiss = () => {
    if (!shown) return
    markDone(shown.id)
    setDone((d) => [...d, shown.id])
    setShown(null)
  }

  const act = async () => {
    if (!shown?.action || acting) return
    setActing(true)
    try {
      await shown.action.run()
    } catch {
      // The page shows its own errors.
    } finally {
      setActing(false)
      dismiss()
    }
  }

  const open = mode !== 'closed'
  // Something to say: an unread answer, or a suggestion on show. The brass ring says so (no coral badge).
  // On phones the bubble stays hidden (pirikoo.css): the ring calls, and the panel opens on the suggested next step.
  const calling = unread || shown !== null
  return (
    <div className={`pkl${open ? ' is-open' : ''}`}>
      <div className="pkl__tip card--dark" role="status" aria-live="polite" hidden={!shown}>
        {shown ? (
          <>
            <p className="pkl__name">{t('pirikoo.name')} <span className="lozenge lozenge--ai">{t('pirikoo.chat.ai')}</span></p>
            <p className="pkl__text">{shown.text}</p>
            <div className="pkl__actions">
              {shown.action ? (
                <button type="button" className="btn btn--primary btn--sm" aria-busy={acting || undefined} onClick={() => void act()}>
                  <span className="btn__label">{shown.action.label}</span>
                </button>
              ) : null}
              <button type="button" className="btn btn--subtle btn--sm" onClick={dismiss}>
                <span className="btn__label">{t('pirikoo.notNow')}</span>
              </button>
              <button type="button" className="icon-btn icon-btn--sm pkl__off" aria-label={t('pirikoo.hide')} title={t('pirikoo.hide')}
                onClick={() => { setAutonomy('off'); setShown(null) }}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </>
        ) : null}
      </div>
      <button
        type="button"
        className={`pkl__button${calling ? ' is-calling' : ''}`}
        aria-label={unread ? t('pirikoo.chat.openUnread') : shown ? t('pirikoo.chat.openTip') : t('pirikoo.chat.open')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? usePirikoo.getState().close() : usePirikoo.getState().open('panel'))}
      >
        <Bird mood={mood} className="pkl__bird" />
      </button>
    </div>
  )
}

function Head({ titleId, variant }: { titleId: string; variant: 'panel' | 'center' }) {
  const { t } = useTranslation()
  const mood = usePirikoo(moodOf)
  const busy = usePirikoo((s) => s.busy)
  const count = usePirikoo((s) => s.items.length)
  const { open, close, clear } = usePirikoo.getState()
  return (
    <header className="pkc__head">
      <span className="pkc__face"><Bird mood={mood} /></span>
      <div className="pkc__heading">
        <h2 id={titleId} className="pkc__title">
          {t('pirikoo.name')} <span className="lozenge lozenge--ai">{t('pirikoo.chat.ai')}</span>
        </h2>
        <p className={`pkc__status${busy ? ' is-busy' : ''}`}>{busy ? t('pirikoo.chat.writingShort') : t('pirikoo.chat.subtitle')}</p>
      </div>
      <div className="pkc__tools">
        {count > 0 ? (
          <button type="button" className="icon-btn" aria-label={t('pirikoo.chat.new')} title={t('pirikoo.chat.new')} onClick={clear}>
            <RotateCcw size={17} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn pkc__resize"
          aria-label={variant === 'panel' ? t('pirikoo.chat.expand') : t('pirikoo.chat.collapse')}
          title={variant === 'panel' ? t('pirikoo.chat.expand') : t('pirikoo.chat.collapse')}
          onClick={() => open(variant === 'panel' ? 'center' : 'panel')}
        >
          {variant === 'panel' ? <Maximize2 size={17} aria-hidden="true" /> : <Minimize2 size={17} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-btn" aria-label={t('common.close')} title={t('common.close')} onClick={close}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

/** The compact chat above the corner button. Not modal: the page stays usable next to it. */
function Panel({ guest }: { guest: boolean }) {
  const titleId = useId()
  return (
    <section
      className="pkc pkc--panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          usePirikoo.getState().close()
        }
      }}
    >
      <Head titleId={titleId} variant="panel" />
      <Conversation guest={guest} />
    </section>
  )
}

/** The centred conversation, like a chat with an assistant: modal, roomy, the same thread. */
function Center({ guest }: { guest: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    return () => d?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="pkc pkc--center"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        usePirikoo.getState().close()
      }}
      onClick={(e) => { if (e.target === ref.current) usePirikoo.getState().close() }}
    >
      <Head titleId={titleId} variant="center" />
      <Conversation guest={guest} />
    </dialog>
  )
}

function Typing() {
  const { t } = useTranslation()
  return (
    <p className="pkc__typing">
      <span>{t('pirikoo.chat.writing')}</span>
      <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
    </p>
  )
}

function Answer({ item, live, onRetry, onRun }: { item: ChatItem; live: boolean; onRetry: () => void; onRun: (steps: NonNullable<ChatItem['plan']>) => void }) {
  const { t } = useTranslation()
  const mood = usePirikoo(moodOf)
  const retry = item.error === 'failed' || item.error === 'offline' || item.error === 'busy'
  return (
    <li className={`pkc__pk${item.state === 'error' ? ' is-error' : ''}`}>
      <span className="pkc__avatar"><Bird mood={live ? mood : undefined} /></span>
      <div className="pkc__answer">
        <span className="pkc__who">
          {t('pirikoo.name')} <span className="lozenge lozenge--ai">{t('pirikoo.chat.ai')}</span>
        </span>
        {item.state === 'waiting' ? <Typing /> : null}
        {item.state === 'error' ? (
          <>
            <p className="pkc__text">{t(`pirikoo.chat.errors.${item.error ?? 'failed'}`)}</p>
            {retry ? (
              <button type="button" className="btn btn--subtle btn--sm pkc__retry" onClick={onRetry}>
                <span className="btn__icon" aria-hidden="true"><RotateCcw size={14} /></span>
                <span className="btn__label">{t('pirikoo.chat.retry')}</span>
              </button>
            ) : null}
          </>
        ) : item.text ? (
          <p className="pkc__text" dir="auto">
            {item.text}
            {item.state === 'streaming' ? <span className="pkc__caret" aria-hidden="true" /> : null}
          </p>
        ) : null}
        {item.state === 'stopped' ? <p className="pkc__note">{t('pirikoo.chat.stopped')}</p> : null}
        {item.plan?.length ? (
          <>
            <p className={item.text ? 'pkc__note' : 'pkc__text'}>{item.text ? t('pirikoo.plan.offer') : t('pirikoo.plan.intro')}</p>
            <PlanCard steps={item.plan} ran={!!item.ran} onRun={onRun} />
          </>
        ) : null}
      </div>
    </li>
  )
}

function Conversation({ guest }: { guest: boolean }) {
  const { t } = useTranslation()
  const items = usePirikoo((s) => s.items)
  const busy = usePirikoo((s) => s.busy)
  const draft = usePirikoo((s) => s.draft)
  const mood = usePirikoo(moodOf)
  const { ask, stop, setDraft, setListening, markRan, remove } = usePirikoo.getState()
  const context = useAskContext()
  const run = useRunPlan()
  const { data: me } = useMe()
  const roomMe = useRoom((s) => s.me)
  const roomId = useRoom((s) => s.circleId)
  const tip = useTip()
  const enabled = useUiStore((s) => s.autonomy === 'suggest')
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const inputId = useId()
  const [announcement, setAnnouncement] = useState('')

  const name = guest ? roomMe?.name : me?.displayName
  const role = context.circleId && roomId === context.circleId ? roomMe?.role : undefined
  const last = items.at(-1)

  useEffect(() => {
    inputRef.current?.focus()
    return () => usePirikoo.getState().setListening(false)
  }, [])

  // Follow the conversation unless the reader scrolled up to read.
  useEffect(() => {
    const el = logRef.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight
  }, [items])

  // Screen readers hear "writing…" once, then the whole answer, never every streamed word.
  useEffect(() => {
    if (!last || last.role !== 'pirikoo') return
    if (last.state === 'waiting') setAnnouncement(t('pirikoo.chat.writing'))
    else if (last.state === 'error') setAnnouncement(t(`pirikoo.chat.errors.${last.error ?? 'failed'}`))
    else if (last.state === 'done') setAnnouncement(`${t('pirikoo.name')}: ${last.text || t('pirikoo.plan.intro')}`)
    // Announce state changes only, not streamed text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id, last?.state])

  const send = (value: string) => {
    const text = value.trim()
    if (!text || text.length > MESSAGE_MAX || busy) return
    const steps = planFor(text, guest)
    setDraft('')
    setListening(false)
    void ask(text, context, steps, steps.length > 0 && !isQuestion(text))
    inputRef.current?.focus()
  }

  const retry = (item: ChatItem) => {
    const at = items.findIndex((i) => i.id === item.id)
    const question = items.slice(0, at).findLast((i) => i.role === 'user')
    if (!question) return
    remove([question.id, item.id])
    send(question.text)
  }

  const runPlan = (item: ChatItem, steps: NonNullable<ChatItem['plan']>) => {
    run(steps)
    markRan(item.id)
    setAnnouncement(t('pirikoo.plan.done'))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(draft)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(draft)
    }
  }

  const questions = t(guest ? 'pirikoo.chat.guestQuestions' : 'pirikoo.chat.questions', { returnObjects: true }) as string[]
  const actions = guest ? [] : (t('pirikoo.plan.examples', { returnObjects: true }) as string[])
  const chips = [...(role ? [t(role === 'animator' ? 'pirikoo.chat.nextAnimator' : 'pirikoo.chat.nextParticipant')] : []), ...questions, ...actions]

  return (
    <div className="pkc__body">
      <div ref={logRef} className="pkc__log" role="log" aria-live="off" aria-label={t('pirikoo.chat.log')} tabIndex={0}>
        {items.length === 0 ? (
          <div className="pkc__hello">
            <span className="pkc__hello-bird"><Bird mood={mood} /></span>
            <h3 className="pkc__hello-title">{name ? t('pirikoo.chat.helloName', { name }) : t('pirikoo.chat.hello')}</h3>
            <p className="pkc__hello-body">{guest ? t('pirikoo.chat.introGuest') : t('pirikoo.chat.intro')}</p>
            {enabled && tip ? (
              <div className="pkc__tip">
                <p className="pkc__tip-label">{t('pirikoo.chat.nextStep')}</p>
                <p>{tip.text}</p>
                {tip.action ? (
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => void tip.action?.run()}>
                    <span className="btn__label">{tip.action.label}</span>
                  </button>
                ) : null}
              </div>
            ) : null}
            <ul className="pkc__chips" aria-label={t('pirikoo.chat.try')}>
              {chips.map((c) => (
                <li key={c}>
                  <button type="button" className="chip" onClick={() => send(c)}>{c}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="pkc__list">
            {items.map((item, i) =>
              item.role === 'user' ? (
                <li key={item.id} className="pkc__me">
                  <p className="pkc__bubble" dir="auto">{item.text}</p>
                </li>
              ) : (
                <Answer key={item.id} item={item} live={i === items.length - 1} onRetry={() => retry(item)} onRun={(steps) => runPlan(item, steps)} />
              ),
            )}
          </ol>
        )}
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>

      <form className="pkc__composer" onSubmit={submit}>
        <label className="visually-hidden" htmlFor={inputId}>{t('pirikoo.chat.label')}</label>
        <textarea
          id={inputId}
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={MESSAGE_MAX}
          // Empty, it follows the page so the placeholder reads right in Arabic; typed text finds its own direction.
          dir={draft ? 'auto' : undefined}
          placeholder={t('pirikoo.chat.placeholder')}
          onChange={(e) => {
            setDraft(e.target.value)
            setListening(e.target.value.trim().length > 0)
          }}
          onFocus={(e) => setListening(e.currentTarget.value.trim().length > 0)}
          onBlur={() => setListening(false)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button type="button" className="pkc__send is-stop" aria-label={t('pirikoo.chat.stop')} title={t('pirikoo.chat.stop')} onClick={stop}>
            <Square size={13} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" className="pkc__send" aria-label={t('pirikoo.chat.send')} title={t('pirikoo.chat.send')} aria-disabled={!draft.trim() || undefined}>
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        )}
      </form>
      <p className="pkc__disclaimer">{t('pirikoo.chat.disclaimer')}</p>
    </div>
  )
}
