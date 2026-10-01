import { useRef, type PointerEvent } from 'react'

const COLORS = ['tomato', 'cobalt', 'sunflower', 'tomato', 'ink', 'cobalt', 'sunflower'] as const

/**
 * "circloo" spelled in plastic alphabet magnets. Each letter can be dragged around the door
 * (pointer only; the word is exposed to assistive tech as one image with its name).
 * Positions are written through CSSOM custom properties, which the strict CSP allows.
 */
export function MagnetWord({ word = 'circloo', label, size = 'xl' }: { word?: string; label: string; size?: 'xl' | 'md' }) {
  const drag = useRef<{ el: HTMLElement; startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  const onDown = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === 'touch') return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    drag.current = {
      el,
      startX: e.clientX,
      startY: e.clientY,
      baseX: Number(el.dataset.x ?? 0),
      baseY: Number(el.dataset.y ?? 0),
    }
    el.classList.add('is-lifted')
  }

  const onMove = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current
    if (!d) return
    // Letters stay on the door: clamp the travel so none can be lost off-screen.
    const x = Math.max(-240, Math.min(240, d.baseX + e.clientX - d.startX))
    const y = Math.max(-160, Math.min(220, d.baseY + e.clientY - d.startY))
    d.el.dataset.x = String(x)
    d.el.dataset.y = String(y)
    d.el.style.setProperty('--dx', `${x}px`)
    d.el.style.setProperty('--dy', `${y}px`)
  }

  const onUp = () => {
    drag.current?.el.classList.remove('is-lifted')
    drag.current = null
  }

  return (
    <div className={`magnet-word magnet-word--${size}`} role="img" aria-label={label}>
      {[...word].map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`letter letter--${COLORS[i % COLORS.length]}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
          onDoubleClick={(e) => {
            const el = e.currentTarget
            el.dataset.x = '0'
            el.dataset.y = '0'
            el.style.setProperty('--dx', '0px')
            el.style.setProperty('--dy', '0px')
          }}
        >
          {ch}
        </span>
      ))}
    </div>
  )
}
