import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useUiStore } from '../../stores/ui'
import { Bird } from './Bird'
import { useTip, type Tip } from './tips'
import '../../styles/pirikoo.css'

const BIRD = 56
const STORE = 'circloo-pirikoo-done'

function readDone(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? '[]') as string[]
  } catch {
    return []
  }
}

function markDone(id: string) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify([...readDone(), id].slice(-200)))
  } catch {
    // Private mode: Pirikoo may repeat itself, nothing worse.
  }
}

type Phase = 'away' | 'flying' | 'perched' | 'leaving'

/** Where to land: on top of the perch element at its inline-end corner, else the screen's bottom corner. */
function landing(perch: string | undefined): { x: number; y: number } {
  const rtl = document.documentElement.dir === 'rtl'
  const w = window.innerWidth
  const h = window.innerHeight
  const el = perch ? document.querySelector<HTMLElement>(`[data-perch="${perch}"]`) : null
  const r = el?.getBoundingClientRect()
  if (r && r.bottom > 80 && r.top < h - 80) {
    const x = rtl ? r.left + 12 : r.right - BIRD - 12
    const y = Math.max(64, r.top - BIRD + 10)
    return { x: Math.min(Math.max(8, x), w - BIRD - 8), y: Math.min(y, h - BIRD - 8) }
  }
  return { x: rtl ? 20 : w - BIRD - 20, y: h - BIRD - (w < 640 ? 96 : 28) }
}

/**
 * Pirikoo, the parakeet guide: flies to where the next step is and suggests it, worded for the animator or
 * for a participant. One tip at a time; "Not now" or doing it sends Pirikoo away until something changes.
 * The Suggestions setting turns Pirikoo off. Never takes focus; Escape closes the bubble.
 */
export function Pirikoo() {
  const { t } = useTranslation()
  const enabled = useUiStore((s) => s.autonomy === 'suggest')
  const setAutonomy = useUiStore((s) => s.setAutonomy)
  const tip = useTip()
  const [shown, setShown] = useState<Tip | null>(null)
  const [phase, setPhase] = useState<Phase>('away')
  const [busy, setBusy] = useState(false)
  const [side, setSide] = useState({ start: false, below: false })
  const ref = useRef<HTMLElement>(null)
  const bubbleId = useId()
  const still = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const leaving = useRef(0)

  const place = useCallback((perch: string | undefined) => {
    const el = ref.current
    if (!el) return
    const { x, y } = landing(perch)
    el.style.setProperty('--px', `${x}px`)
    el.style.setProperty('--py', `${y}px`)
    // The bubble opens toward the middle of the screen, and below the bird near the top so the bar never hides it.
    setSide((prev) => {
      const next = { start: x < window.innerWidth / 2, below: y < 240 }
      return prev.start === next.start && prev.below === next.below ? prev : next
    })
  }, [])

  const leave = useCallback(() => {
    const el = ref.current
    if (el) {
      const rtl = document.documentElement.dir === 'rtl'
      el.style.setProperty('--px', `${rtl ? -BIRD * 2 : window.innerWidth + BIRD}px`)
      el.style.setProperty('--py', '-80px')
    }
    setPhase('leaving')
    window.clearTimeout(leaving.current)
    leaving.current = window.setTimeout(() => {
      setShown(null)
      setPhase('away')
    }, still.current ? 0 : 800)
  }, [])

  // A new suggestion: after a breath, fly in and land next to the thing it is about.
  const nextId = enabled && tip && !readDone().includes(tip.id) ? tip.id : null
  useEffect(() => {
    if (!nextId) {
      if (shown) leave()
      return
    }
    if (shown?.id === nextId) return
    const wait = window.setTimeout(() => {
      // A new tip wins over a departure still in progress.
      window.clearTimeout(leaving.current)
      setShown(tip)
      setPhase('flying')
      requestAnimationFrame(() => place(tip?.perch))
      window.setTimeout(() => setPhase('perched'), still.current ? 0 : 900)
    }, shown ? 300 : 1600)
    return () => window.clearTimeout(wait)
    // Only the identity of the suggestion matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextId])

  // Keep the text current (counts, names) without flying again.
  useEffect(() => {
    if (tip && shown && tip.id === shown.id && tip.text !== shown.text) setShown(tip)
  }, [tip, shown])

  // Stay on the perch when the page scrolls or resizes.
  useEffect(() => {
    if (phase !== 'perched' || !shown) return
    let frame = 0
    const onMove = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => place(shown.perch))
    }
    window.addEventListener('scroll', onMove, { passive: true, capture: true })
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, { capture: true })
      window.removeEventListener('resize', onMove)
      cancelAnimationFrame(frame)
    }
  }, [phase, shown, place])

  const done = () => {
    if (shown) markDone(shown.id)
    leave()
  }

  const act = async () => {
    if (!shown?.action || busy) return
    setBusy(true)
    try {
      await shown.action.run()
    } catch {
      // The page shows its own errors; Pirikoo just steps aside.
    } finally {
      setBusy(false)
      done()
    }
  }

  if (!shown) return <aside ref={ref} className="pirikoo is-away" aria-hidden="true" />

  return (
    <aside
      ref={ref}
      className={`pirikoo is-${phase}${side.start ? ' pirikoo--start' : ''}${side.below ? ' pirikoo--below' : ''}`}
      aria-label={t('pirikoo.label')}
      onKeyDown={(e) => { if (e.key === 'Escape') done() }}
    >
      <div className="pirikoo__bird">
        <Bird />
      </div>
      <div className="pirikoo__bubble" id={bubbleId} role="status" aria-live="polite" hidden={phase !== 'perched'}>
        <p className="pirikoo__name">{t('pirikoo.name')}</p>
        <p className="pirikoo__text">{shown.text}</p>
        <div className="pirikoo__actions">
          {shown.action ? (
            <button type="button" className="btn btn--primary btn--sm" aria-busy={busy || undefined} onClick={() => void act()}>
              <span className="btn__label">{shown.action.label}</span>
            </button>
          ) : null}
          <button type="button" className="btn btn--subtle btn--sm" onClick={done}>
            <span className="btn__label">{t('pirikoo.notNow')}</span>
          </button>
          <button type="button" className="icon-btn icon-btn--sm pirikoo__off" aria-label={t('pirikoo.hide')} title={t('pirikoo.hide')} onClick={() => { setAutonomy('off'); leave() }}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  )
}
