import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Circle, Crosshair, Heart, Laugh, Lightbulb, List, Minus, Pencil, Pin, Plus, Square, Star, StickyNote, ThumbsUp, Trash2, X } from 'lucide-react'
import { Character } from '../../components/Character'
import { usePopover } from '../../components/usePopover'
import type { CanvasColor, CanvasNote, CanvasShape, CanvasSize, CanvasSticker, Member } from '../../api/circles'
import { CANVAS, CANVAS_COLORS, CANVAS_EXTENT, CANVAS_SHAPES, CANVAS_SIZES, CANVAS_STICKERS, NOTE_MAX } from './catalog'
import { useRoom } from './room'
import '../../styles/canvas.css'

const STICKER_ICONS: Record<CanvasSticker, typeof Heart> = { heart: Heart, star: Star, thumbs: ThumbsUp, laugh: Laugh, idea: Lightbulb }
const ZOOM_MIN = 0.4
const ZOOM_MAX = 2
/** A cursor that has not moved for this long fades away. */
const CURSOR_IDLE = 6000
const SEND_EVERY = 120
const STEP = 10

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const bound = (v: number) => clamp(Math.round(v * 10) / 10, -CANVAS_EXTENT, CANVAS_EXTENT)
// A handful of cursor colours, picked from the member id so everyone keeps theirs.
const hue = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 6

interface View {
  x: number
  y: number
  z: number
}

/** Sets CSS custom properties through CSSOM: the CSP allows no inline style attributes. */
function useVars(ref: RefObject<HTMLElement | null>, vars: Record<string, string>) {
  const key = JSON.stringify(vars)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    for (const [k, v] of Object.entries(JSON.parse(key) as Record<string, string>)) el.style.setProperty(k, v)
  }, [ref, key])
}

function NoteView({ note, author, selected, canEdit, zoom, onSelect, onEdit }: {
  note: CanvasNote
  author: Member | undefined
  selected: boolean
  canEdit: boolean
  zoom: () => number
  onSelect: () => void
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const moveCanvasNote = useRoom((s) => s.moveCanvasNote)
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x0: number; y0: number; nx: number; ny: number; moved: boolean; sent: number } | null>(null)
  const local = useRef({ x: note.x, y: note.y })
  // While I move a note, echoes of my own moves must not pull it back.
  const holdUntil = useRef(0)
  const suppressClick = useRef(false)

  useVars(ref, { '--tilt': `${((note.id % 5) - 2) * 0.9}deg` })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const apply = () => {
      local.current = { x: note.x, y: note.y }
      el.style.setProperty('--x', String(note.x))
      el.style.setProperty('--y', String(note.y))
    }
    const wait = holdUntil.current - Date.now()
    if (wait <= 0) {
      apply()
      return
    }
    const timer = window.setTimeout(apply, wait)
    return () => window.clearTimeout(timer)
  }, [note.x, note.y])

  const place = (x: number, y: number, final: boolean) => {
    local.current = { x: bound(x), y: bound(y) }
    ref.current?.style.setProperty('--x', String(local.current.x))
    ref.current?.style.setProperty('--y', String(local.current.y))
    const now = Date.now()
    holdUntil.current = now + (final ? 700 : 60_000)
    const d = drag.current
    if (final || !d || now - d.sent > SEND_EVERY) {
      if (d) d.sent = now
      void moveCanvasNote(note.id, local.current.x, local.current.y).catch(() => undefined)
    }
  }

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x0: e.clientX, y0: e.clientY, nx: local.current.x, ny: local.current.y, moved: false, sent: 0 }
  }

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x0) / zoom()
    const dy = (e.clientY - d.y0) / zoom()
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) {
      d.moved = true
      setDragging(true)
    }
    place(d.nx + dx, d.ny + dy, false)
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    suppressClick.current = true
    setDragging(false)
    place(local.current.x, local.current.y, true)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? STEP * 5 : STEP
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const move = moves[e.key]
    if (move) {
      e.preventDefault()
      place(local.current.x + move[0], local.current.y + move[1], true)
    } else if ((e.key === 'F2' || e.key === 'e') && canEdit) {
      e.preventDefault()
      onEdit()
    }
  }

  const Sticker = note.sticker ? STICKER_ICONS[note.sticker] : null
  return (
    <div
      ref={ref}
      className={`canvas-note canvas-note--${note.color} canvas-note--${note.size} canvas-note--${note.shape}${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      data-note={note.id}
    >
      <button
        type="button"
        className="canvas-note__body"
        aria-pressed={selected}
        aria-label={t('canvas.note', { name: author?.name ?? '', text: note.text })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (canEdit) onEdit()
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          onSelect()
        }}
        onKeyDown={onKeyDown}
      >
        <span className="canvas-note__text" dir="auto">{note.text}</span>
        {author ? <Character id={author.character} ring={author.ring} className="canvas-note__by" /> : null}
      </button>
      {Sticker ? (
        <span className={`canvas-note__sticker canvas-note__sticker--${note.sticker}`} aria-hidden="true">
          <Sticker size={16} strokeWidth={2.5} />
        </span>
      ) : null}
    </div>
  )
}

/** Writing a note in place: on a new spot (double-click), or over an existing note to edit it. */
function Draft({ at, initial, color, onColor, onSave, onCancel, editing }: {
  at: { x: number; y: number }
  initial: string
  color: CanvasColor
  onColor?: (c: CanvasColor) => void
  onSave: (text: string) => void
  onCancel: () => void
  editing: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(initial)
  const inputId = useId()
  useVars(ref, { '--x': String(at.x), '--y': String(at.y) })
  useEffect(() => inputRef.current?.focus(), [])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const clean = text.trim()
    if (clean) onSave(clean)
    else onCancel()
  }

  return (
    <form
      ref={ref}
      className={`canvas-draft canvas-note--${color}`}
      onSubmit={submit}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <label className="visually-hidden" htmlFor={inputId}>{editing ? t('canvas.editNote') : t('canvas.newNote')}</label>
      <textarea
        id={inputId}
        ref={inputRef}
        value={text}
        maxLength={NOTE_MAX}
        rows={3}
        dir="auto"
        placeholder={t('canvas.placeholder')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />
      {onColor ? (
        <div className="canvas-draft__colors" role="group" aria-label={t('boards.color')}>
          {CANVAS_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch swatch--${c}`} aria-pressed={c === color} aria-label={t(`canvas.colors.${c}`)} onClick={() => onColor(c)} />
          ))}
        </div>
      ) : null}
      <div className="canvas-draft__actions">
        <button type="button" className="btn btn--subtle btn--sm" onClick={onCancel}><span className="btn__label">{t('common.cancel')}</span></button>
        <button type="submit" className="btn btn--primary btn--sm"><span className="btn__label">{t('canvas.stick')}</span></button>
      </div>
    </form>
  )
}

function RemoteCursor({ member, x, y, at, now }: { member: Member; x: number; y: number; at: number; now: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useVars(ref, { '--x': String(x), '--y': String(y) })
  const idle = now - at > CURSOR_IDLE
  const moving = now - at < 700
  return (
    <div ref={ref} className={`canvas-cursor canvas-cursor--c${hue(member.id)}${idle ? ' is-idle' : ''}${moving ? ' is-moving' : ''}`} aria-hidden="true">
      <svg className="canvas-cursor__arrow" viewBox="0 0 16 16">
        <path d="M1.5 1.5 L14 7.2 L8.4 8.6 L6.3 14.2 Z" />
      </svg>
      <span className="canvas-cursor__tag">
        <Character id={member.character} ring={member.ring} className="canvas-cursor__char" />
        <bdi>{member.name}</bdi>
      </span>
    </div>
  )
}

/** Board notes and answers from this circle, ready to pin on the canvas. */
function BringIn({ onPin }: { onPin: (text: string, color: CanvasColor) => void }) {
  const { t } = useTranslation()
  const notes = useRoom((s) => s.notes)
  const messages = useRoom((s) => s.messages)
  const { open, toggle, close, triggerRef, panelRef, panelProps } = usePopover()
  const panelId = useId()
  const items = [
    ...notes.map((n) => ({ key: `n${n.id}`, text: n.text, color: n.color as CanvasColor })),
    ...messages.filter((m) => m.kind === 'member').map((m) => ({ key: `m${m.id}`, text: m.text, color: 'white' as CanvasColor })),
  ].filter((it, i, all) => all.findIndex((x) => x.text === it.text) === i).slice(-24).reverse()

  return (
    <div className="canvas__bring">
      <button ref={triggerRef} type="button" className="btn btn--default btn--sm" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span className="btn__icon" aria-hidden="true"><Pin size={14} /></span>
        <span className="btn__label">{t('canvas.bringIn')}</span>
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} className="canvas__bring-panel" {...panelProps}>
          <p className="canvas__bring-title">{t('canvas.bringInTitle')}</p>
          {items.length === 0 ? (
            <p className="canvas__bring-empty">{t('canvas.bringInEmpty')}</p>
          ) : (
            <ul className="canvas__bring-list">
              {items.map((it) => (
                <li key={it.key}>
                  <button type="button" className="canvas__bring-item" onClick={() => { onPin(it.text.slice(0, NOTE_MAX), it.color); close() }}>
                    <span className={`canvas__bring-dot canvas-note--${it.color}`} aria-hidden="true" />
                    <span dir="auto">{it.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The live canvas (issue #93): everyone's notes on one surface, placed anywhere, styled, and the others' cursors
 * gliding around with their character. Drag the background or scroll to look around; Ctrl + scroll zooms.
 */
export function Canvas() {
  const { t } = useTranslation()
  const { me, members, canvas, cursors, error, clearError, addCanvasNote, editCanvasNote, styleCanvasNote, deleteCanvasNote, sendCursor } = useRoom()
  const notes = canvas.filter((n) => n.activityId === CANVAS)
  const viewportRef = useRef<HTMLDivElement>(null)
  const view = useRef<View>({ x: 0, y: 0, z: 1 })
  const pan = useRef<{ x0: number; y0: number; vx: number; vy: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [panning, setPanning] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; edit?: number } | null>(null)
  const [color, setColor] = useState<CanvasColor>('yellow')
  const [list, setList] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const hintId = useId()
  const isAnimator = me?.role === 'animator'

  const apply = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const v = view.current
    el.style.setProperty('--pan-x', `${v.x}px`)
    el.style.setProperty('--pan-y', `${v.y}px`)
    el.style.setProperty('--zoom', String(v.z))
  }, [])

  const center = useCallback((x = 0, y = 0) => {
    const el = viewportRef.current
    if (!el) return
    view.current = { ...view.current, x: el.clientWidth / 2 - x * view.current.z, y: el.clientHeight / 2 - y * view.current.z }
    apply()
  }, [apply])

  useLayoutEffect(() => center(), [center])

  const toWorld = (clientX: number, clientY: number) => {
    const r = viewportRef.current!.getBoundingClientRect()
    const v = view.current
    return { x: bound((clientX - r.left - v.x) / v.z), y: bound((clientY - r.top - v.y) / v.z) }
  }

  const middle = () => {
    const el = viewportRef.current!
    const r = el.getBoundingClientRect()
    const p = toWorld(r.left + el.clientWidth / 2, r.top + el.clientHeight / 2)
    // A little scatter so several notes added in a row don't hide each other.
    return { x: bound(p.x + ((notes.length % 5) - 2) * 24), y: bound(p.y + ((notes.length % 3) - 1) * 24) }
  }

  const zoomTo = useCallback((z: number, clientX?: number, clientY?: number) => {
    const el = viewportRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = clientX === undefined ? el.clientWidth / 2 : clientX - r.left
    const py = clientY === undefined ? el.clientHeight / 2 : clientY - r.top
    const v = view.current
    const next = clamp(Math.round(z * 100) / 100, ZOOM_MIN, ZOOM_MAX)
    // Keep the point under the pointer still while zooming.
    view.current = { x: px - ((px - v.x) / v.z) * next, y: py - ((py - v.y) / v.z) * next, z: next }
    apply()
    setZoom(next)
  }, [apply])

  // Wheel: scroll to look around, Ctrl/⌘ + scroll to zoom. Not passive, so the page does not scroll instead.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) zoomTo(view.current.z * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX, e.clientY)
      else {
        view.current = { ...view.current, x: view.current.x - e.deltaX, y: view.current.y - e.deltaY }
        apply()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [apply, zoomTo])

  // Fade cursors that stopped moving.
  const anyCursor = Object.keys(cursors).length > 0
  useEffect(() => {
    if (!anyCursor) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [anyCursor])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || draft) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pan.current = { x0: e.clientX, y0: e.clientY, vx: view.current.x, vy: view.current.y }
    setSelected(null)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') {
      const p = toWorld(e.clientX, e.clientY)
      sendCursor(p.x, p.y)
    }
    const p = pan.current
    if (!p) return
    if (!panning && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 3) setPanning(true)
    view.current = { ...view.current, x: p.vx + e.clientX - p.x0, y: p.vy + e.clientY - p.y0 }
    apply()
  }

  const endPan = () => {
    pan.current = null
    setPanning(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const step = 60
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    const move = moves[e.key]
    if (move) {
      e.preventDefault()
      view.current = { ...view.current, x: view.current.x + move[0], y: view.current.y + move[1] }
      apply()
    } else if (e.key === '+' || e.key === '=') zoomTo(view.current.z + 0.1)
    else if (e.key === '-') zoomTo(view.current.z - 0.1)
    else if (e.key === '0') center()
    else if (e.key === 'n' || e.key === 'Enter') {
      e.preventDefault()
      setDraft(middle())
    }
  }

  const add = async (text: string, at: { x: number; y: number }, noteColor = color) => {
    clearError()
    try {
      await addCanvasNote(at.x, at.y, text, noteColor, 'm', 'square')
      setDraft(null)
    } catch {
      // The room shows the error code below the canvas.
    }
  }

  const save = async (text: string) => {
    if (!draft) return
    if (draft.edit === undefined) return add(text, draft)
    clearError()
    try {
      await editCanvasNote(draft.edit, text)
      setDraft(null)
    } catch {
      // Shown below.
    }
  }

  const note = notes.find((n) => n.id === selected)
  const canStyle = !!note && (note.authorId === me?.id || isAnimator)
  const restyle = (change: Partial<Pick<CanvasNote, 'color' | 'size' | 'shape' | 'sticker'>>) => {
    if (!note) return
    const next = { ...note, ...change }
    void styleCanvasNote(note.id, next.color, next.size, next.shape, next.sticker).catch(() => undefined)
  }

  const show = (n: CanvasNote) => {
    center(n.x, n.y)
    setSelected(n.id)
    requestAnimationFrame(() => viewportRef.current?.querySelector<HTMLElement>(`[data-note="${n.id}"] button`)?.focus())
  }

  const author = (id: string) => members.find((m) => m.id === id)
  const zoomLabel = `${Math.round(zoom * 100)}%`

  return (
    <section className="panel canvas" aria-labelledby="canvas-title" data-perch="canvas">
      <div className="panel__head canvas__head">
        <h2 id="canvas-title" className="panel__title">{t('activities.canvas.title')}</h2>
        <div className="canvas__tools">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setDraft(middle())}>
            <span className="btn__icon" aria-hidden="true"><StickyNote size={14} /></span>
            <span className="btn__label">{t('canvas.add')}</span>
          </button>
          <BringIn onPin={(text, c) => void add(text, middle(), c)} />
          <span className="canvas__sep" aria-hidden="true" />
          <button type="button" className="icon-btn" aria-label={t('canvas.zoomOut')} title={t('canvas.zoomOut')} onClick={() => zoomTo(view.current.z - 0.1)}><Minus size={16} aria-hidden="true" /></button>
          <span className="canvas__zoom" aria-live="polite">{zoomLabel}</span>
          <button type="button" className="icon-btn" aria-label={t('canvas.zoomIn')} title={t('canvas.zoomIn')} onClick={() => zoomTo(view.current.z + 0.1)}><Plus size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-btn" aria-label={t('canvas.recenter')} title={t('canvas.recenter')} onClick={() => center()}><Crosshair size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-btn" aria-pressed={list} aria-label={t('canvas.list')} title={t('canvas.list')} onClick={() => setList((l) => !l)}><List size={16} aria-hidden="true" /></button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`canvas__viewport${panning ? ' is-panning' : ''}`}
        role="group"
        aria-label={t('canvas.label')}
        aria-describedby={hintId}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas__world')) setDraft(toWorld(e.clientX, e.clientY))
        }}
        onKeyDown={onKeyDown}
      >
        <div className="canvas__world" dir="ltr">
          {notes.map((n) => (
            <NoteView
              key={n.id}
              note={n}
              author={author(n.authorId)}
              selected={n.id === selected}
              canEdit={n.authorId === me?.id}
              zoom={() => view.current.z}
              onSelect={() => setSelected((s) => (s === n.id ? null : n.id))}
              onEdit={() => {
                setSelected(null)
                setDraft({ x: n.x, y: n.y, edit: n.id })
              }}
            />
          ))}
          {draft ? (
            <Draft
              key={draft.edit ?? `${draft.x},${draft.y}`}
              at={draft}
              editing={draft.edit !== undefined}
              initial={draft.edit === undefined ? '' : (notes.find((n) => n.id === draft.edit)?.text ?? '')}
              color={draft.edit === undefined ? color : (notes.find((n) => n.id === draft.edit)?.color ?? color)}
              onColor={draft.edit === undefined ? setColor : undefined}
              onSave={(text) => void save(text)}
              onCancel={() => setDraft(null)}
            />
          ) : null}
          {Object.entries(cursors).map(([id, c]) => {
            const m = author(id)
            return m && id !== me?.id ? <RemoteCursor key={id} member={m} x={c.x} y={c.y} at={c.at} now={now} /> : null
          })}
        </div>
        {notes.length === 0 && !draft ? <p className="canvas__empty">{t('canvas.empty')}</p> : null}

        {note && canStyle ? (
          <div className="canvas__style" role="toolbar" aria-label={t('canvas.style')} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <div className="canvas__style-group" role="group" aria-label={t('boards.color')}>
              {CANVAS_COLORS.map((c) => (
                <button key={c} type="button" className={`swatch swatch--${c}`} aria-pressed={note.color === c} aria-label={t(`canvas.colors.${c}`)} onClick={() => restyle({ color: c })} />
              ))}
            </div>
            <div className="canvas__style-group" role="group" aria-label={t('canvas.size')}>
              {CANVAS_SIZES.map((s: CanvasSize) => (
                <button key={s} type="button" className="canvas__chip" aria-pressed={note.size === s} aria-label={t(`canvas.sizes.${s}`)} title={t(`canvas.sizes.${s}`)} onClick={() => restyle({ size: s })}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="canvas__style-group" role="group" aria-label={t('canvas.shape')}>
              {CANVAS_SHAPES.map((s: CanvasShape) => (
                <button key={s} type="button" className="icon-btn icon-btn--sm" aria-pressed={note.shape === s} aria-label={t(`canvas.shapes.${s}`)} title={t(`canvas.shapes.${s}`)} onClick={() => restyle({ shape: s })}>
                  {s === 'square' ? <Square size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
                </button>
              ))}
            </div>
            <div className="canvas__style-group" role="group" aria-label={t('canvas.sticker')}>
              {CANVAS_STICKERS.map((s: CanvasSticker) => {
                const Icon = STICKER_ICONS[s]
                return (
                  <button key={s} type="button" className={`icon-btn icon-btn--sm canvas__sticker canvas__sticker--${s}`} aria-pressed={note.sticker === s} aria-label={t(`canvas.stickers.${s}`)} title={t(`canvas.stickers.${s}`)}
                    onClick={() => restyle({ sticker: note.sticker === s ? null : s })}>
                    <Icon size={15} aria-hidden="true" />
                  </button>
                )
              })}
            </div>
            <div className="canvas__style-group">
              {note.authorId === me?.id ? (
                <button type="button" className="icon-btn icon-btn--sm" aria-label={t('canvas.editNote')} title={t('canvas.editNote')} onClick={() => { setSelected(null); setDraft({ x: note.x, y: note.y, edit: note.id }) }}>
                  <Pencil size={15} aria-hidden="true" />
                </button>
              ) : null}
              <button type="button" className="icon-btn icon-btn--sm" aria-label={t('canvas.delete')} title={t('canvas.delete')} onClick={() => { setSelected(null); void deleteCanvasNote(note.id).catch(() => undefined) }}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
              <button type="button" className="icon-btn icon-btn--sm" aria-label={t('common.close')} title={t('common.close')} onClick={() => setSelected(null)}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <p id={hintId} className="canvas__hint">{t('canvas.hint')}</p>
      {error && ['note-invalid', 'board-full', 'message-unsafe', 'author-only'].includes(error) ? (
        <p className="field__error canvas__error" role="alert">{t(`circles.errors.${error}`)}</p>
      ) : null}

      {list ? (
        <div className="canvas__list">
          <h3 className="canvas__list-title">{t('canvas.listTitle', { count: notes.length })}</h3>
          <ol>
            {notes.map((n) => (
              <li key={n.id} className="canvas__list-item">
                <span className={`canvas__bring-dot canvas-note--${n.color}`} aria-hidden="true" />
                <span className="canvas__list-text" dir="auto">{n.text}</span>
                <span className="canvas__list-by"><bdi>{author(n.authorId)?.name ?? ''}</bdi></span>
                <button type="button" className="btn btn--subtle btn--sm" onClick={() => show(n)}><span className="btn__label">{t('canvas.find')}</span></button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}
