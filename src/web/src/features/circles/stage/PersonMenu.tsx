import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { EllipsisVertical } from 'lucide-react'
import { hubCode } from '../room'
import { useStage, type Source } from './stage'

type Action = 'give' | 'take' | 'mute-mic' | 'allow-mic' | 'stop-camera' | 'allow-camera' | 'remove'
interface Item {
  action: Action
  label: string
}

const GAP = 6
const EDGE = 8

/**
 * The animator's menu for one person in the call (spec 009 US3, T926), on their tile and on their row in the Call tab:
 * give or take back the floor, switch their microphone or camera off and allow it again, remove them from the call
 * (asked once more, in place). A menu button (WAI-ARIA APG): arrows, Home and End move, Escape and Tab close and give the
 * focus back. The menu is drawn over the page so a small tile never clips it. The server decides; a refusal shows here.
 *
 * Mutes and removals are what this tab did (the hub tells only the person), see `Moderation` in stage.ts.
 */
export function PersonMenu({ memberId, name }: { memberId: string; name: string }) {
  const { t } = useTranslation()
  const discussion = useStage((s) => s.discussion)
  const hands = useStage((s) => s.hands)
  const moderation = useStage((s) => s.moderation)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'menu' | 'confirm'>('menu')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState('')
  const [start, setStart] = useState<'first' | 'last'>('first')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const triggerId = `${id}-trigger`
  const questionId = `${id}-question`

  const items: Item[] = []
  if (hands?.floor === memberId) items.push({ action: 'take', label: t('circles.call.menu.take') })
  else if (hands?.queue.some((h) => h.memberId === memberId)) items.push({ action: 'give', label: t('circles.call.menu.give') })
  items.push(
    moderation.microphone.includes(memberId)
      ? { action: 'allow-mic', label: t('circles.call.menu.allowMic') }
      : { action: 'mute-mic', label: t('circles.call.menu.muteMic') },
  )
  if (discussion?.videoAllowed) {
    items.push(
      moderation.camera.includes(memberId)
        ? { action: 'allow-camera', label: t('circles.call.menu.allowCamera') }
        : { action: 'stop-camera', label: t('circles.call.menu.stopCamera') },
    )
  }
  items.push({ action: 'remove', label: t('circles.call.menu.remove') })

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    setStep('menu')
    setError(null)
    if (refocus) triggerRef.current?.focus()
  }, [])

  const show = (from: 'first' | 'last') => {
    setStart(from)
    setStep('menu')
    setError(null)
    setOpen(true)
  }

  // Placed under the trigger, its inline end on the trigger's, above it when the screen has no room below.
  const place = useCallback(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return
    // Measured at the origin, so its width never depends on where it was last.
    panel.style.top = '0px'
    panel.style.left = '0px'
    const r = trigger.getBoundingClientRect()
    const p = panel.getBoundingClientRect()
    const rtl = getComputedStyle(trigger).direction === 'rtl'
    const below = r.bottom + GAP + p.height <= window.innerHeight - EDGE
    const top = below ? r.bottom + GAP : Math.max(EDGE, r.top - GAP - p.height)
    const left = Math.min(Math.max(EDGE, rtl ? r.left : r.right - p.width), window.innerWidth - p.width - EDGE)
    panel.style.top = `${top}px`
    panel.style.left = `${left}px`
  }, [])
  useLayoutEffect(() => {
    if (open) place()
  }, [open, step, error, place])

  // The first item (or the last, from ArrowUp) takes the focus; the question focuses Cancel, the safe answer.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (step === 'confirm') {
      panel?.querySelector<HTMLElement>('[data-cancel]')?.focus()
      return
    }
    const list = [...(panel?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    ;(start === 'last' ? list[list.length - 1] : list[0])?.focus()
  }, [open, step, start])

  // A press outside closes it. A scroll (the sheet, the page) or a resize moves it with its trigger, once a frame.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false)
    }
    let frame = 0
    const follow = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [open, close, place])

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      show(e.key === 'ArrowUp' ? 'last' : 'first')
    }
  }

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const list = [...(panelRef.current?.querySelectorAll<HTMLElement>('button') ?? [])]
    if (!list.length) return
    e.preventDefault()
    const at = list.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
    list[next]?.focus()
  }

  const run = async (action: Action) => {
    if (busy) return
    if (action === 'remove' && step === 'menu') {
      setStep('confirm')
      return
    }
    const s = useStage.getState()
    const source: Source = action.endsWith('camera') ? 'camera' : 'microphone'
    const work: Record<Action, () => Promise<void>> = {
      give: () => s.giveFloor(memberId),
      take: () => s.takeFloor(memberId),
      'mute-mic': () => s.muteMember(memberId, source),
      'allow-mic': () => s.allowMember(memberId, source),
      'stop-camera': () => s.muteMember(memberId, source),
      'allow-camera': () => s.allowMember(memberId, source),
      remove: () => s.removeFromCall(memberId),
    }
    setBusy(true)
    setError(null)
    try {
      await work[action]()
      setDone(t(`circles.call.menu.done.${action}`, { name }))
      close(true)
    } catch (e) {
      const code = hubCode(e)
      setError(t(`circles.call.errors.${code}`, { defaultValue: t('circles.call.errors.failed') }))
    } finally {
      setBusy(false)
    }
  }

  const panel = open ? (
    <div
      ref={panelRef}
      id={`${id}-menu`}
      className="person-menu"
      onKeyDown={onPanelKey}
      aria-busy={busy || undefined}
    >
      {step === 'menu' ? (
        <div role="menu" aria-labelledby={triggerId} className="person-menu__list">
          {items.map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-action={item.action}
              className={`person-menu__item${item.action === 'remove' ? ' is-danger' : ''}`}
              aria-disabled={busy || undefined}
              onClick={() => void run(item.action)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : (
        <div role="group" aria-labelledby={questionId} className="person-menu__confirm">
          <p id={questionId} className="person-menu__question">{t('circles.call.menu.confirmRemove', { name })}</p>
          <div className="person-menu__answers">
            <button type="button" className="btn btn--danger btn--sm" data-confirm="" aria-disabled={busy || undefined} onClick={() => void run('remove')}>
              {t('circles.call.menu.confirmYes')}
            </button>
            <button type="button" className="btn btn--subtle btn--sm" data-cancel="" onClick={() => close(true)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      {error ? <p className="person-menu__error" role="alert">{error}</p> : null}
    </div>
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="person-menu__trigger"
        aria-label={t('circles.call.menu.label', { name })}
        title={t('circles.call.menu.label', { name })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        data-member-menu={memberId}
        onKeyDown={onTriggerKey}
        onClick={() => (open ? close(false) : show('first'))}
      >
        <EllipsisVertical size={18} aria-hidden="true" />
      </button>
      <span className="visually-hidden" aria-live="polite">{done}</span>
      {panel ? createPortal(panel, document.body) : null}
    </>
  )
}
