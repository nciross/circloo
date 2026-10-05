import { useCallback, useEffect, useLayoutEffect, useState, type KeyboardEvent } from 'react'
import { useLandingMotion } from './motion'

/** What reveals as it scrolls into view. Staggers by position inside the parent. */
const REVEAL = '.band .section-head, .band .section-title, .steps .step, .facts .fact, .platform, .faqrow, .quote, .compare, .integrations .integration, .plan, .cta__inner, .preview, .story__head, .logos, .pilltabs'

/**
 * Scroll reveals that work in every browser: elements start a little low and transparent and settle when they
 * enter the screen, once. Done in a layout effect so nothing flashes. Skipped while motion is off and when
 * IntersectionObserver is missing, in which case everything simply shows.
 */
export function useScrollReveal() {
  const { on } = useLandingMotion()
  useLayoutEffect(() => {
    if (!on || !('IntersectionObserver' in window)) return
    const els = [...document.querySelectorAll<HTMLElement>(REVEAL)]
    els.forEach((el) => {
      const siblings = el.parentElement ? [...el.parentElement.children].filter((c) => c.matches(REVEAL)) : []
      el.style.setProperty('--rv', String(Math.max(0, siblings.indexOf(el))))
      el.classList.add('rv')
    })
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const el = e.target as HTMLElement
          el.classList.add('is-in')
          io.unobserve(el)
          // Once settled, drop the reveal classes so their delay and transform never get in the way of hover effects.
          const done = (ev: TransitionEvent) => {
            if (ev.target !== el || ev.pseudoElement || ev.propertyName !== 'transform') return
            el.removeEventListener('transitionend', done)
            el.classList.remove('rv', 'is-in')
          }
          el.addEventListener('transitionend', done)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    els.forEach((el) => io.observe(el))
    return () => {
      io.disconnect()
      els.forEach((el) => el.classList.remove('rv', 'is-in'))
    }
  }, [on])
}

/** Page scroll progress for the bar under the top bar, set as a CSS variable (no re-render). */
export function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      el.style.setProperty('--p', String(max > 0 ? Math.min(1, window.scrollY / max) : 0))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [ref])
}

/** Cycles through `count` items every `ms`; stays put while motion is off or while `paused`. */
export function useCycle(count: number, ms: number, paused = false) {
  const { on } = useLandingMotion()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (paused || !on || count < 2) return
    const id = window.setInterval(() => setI((n) => (n + 1) % count), ms)
    return () => window.clearInterval(id)
  }, [count, ms, paused, on])
  return i
}

const STILL_KEY = 'circloo-landing-still'

/**
 * The visitor's "pause animations" choice for the landing (WCAG 2.2.2), remembered in this browser only.
 * Offered only while motion is on: either the system allows it or the visitor opted in to play it.
 */
export function useStillMotion() {
  const { on } = useLandingMotion()
  const [still, setStill] = useState(() => {
    try {
      return window.localStorage.getItem(STILL_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggle = useCallback(() => {
    setStill((v) => {
      try {
        window.localStorage.setItem(STILL_KEY, v ? '0' : '1')
      } catch {
        /* storage blocked: the choice lasts for this visit */
      }
      return !v
    })
  }, [])
  return { still, toggle, offered: on }
}

/**
 * Keyboard for a tablist: left/right follow the reading direction, up/down too when the list is vertical
 * (it lays out in a row on small screens, so both work), plus Home and End.
 * Returns the index to move to, or null when the key is not one of ours.
 */
export function tabKey(e: KeyboardEvent<HTMLElement>, index: number, count: number, vertical = false): number | null {
  const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
  const fwd = rtl ? 'ArrowLeft' : 'ArrowRight'
  const back = rtl ? 'ArrowRight' : 'ArrowLeft'
  let next: number | null = null
  if (e.key === fwd || (vertical && e.key === 'ArrowDown')) next = index + 1
  else if (e.key === back || (vertical && e.key === 'ArrowUp')) next = index - 1
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = count - 1
  if (next === null) return null
  e.preventDefault()
  return (next + count) % count
}
