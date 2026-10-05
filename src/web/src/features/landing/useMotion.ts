import { useEffect, useLayoutEffect, useState } from 'react'

/** What reveals as it scrolls into view. Staggers by position inside the parent. */
const REVEAL = '.section-head, .section-title, .feature, .steps, .jokes .joke, .demo-board, .integrations, .plan, .cta__inner, .preview, .story__head, .band .reveal'

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Scroll reveals that work in every browser: elements start a little low and transparent and settle when they
 * enter the screen, once. Done in a layout effect so nothing flashes. Skipped for reduced motion and when
 * IntersectionObserver is missing, in which case everything simply shows.
 */
export function useScrollReveal() {
  useLayoutEffect(() => {
    if (reduced() || !('IntersectionObserver' in window)) return
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
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    els.forEach((el) => io.observe(el))
    return () => {
      io.disconnect()
      els.forEach((el) => el.classList.remove('rv', 'is-in'))
    }
  }, [])
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

/** Cycles through `count` items every `ms`; stays on the first one under reduced motion. */
export function useCycle(count: number, ms: number) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (reduced() || count < 2) return
    const id = window.setInterval(() => setI((n) => (n + 1) % count), ms)
    return () => window.clearInterval(id)
  }, [count, ms])
  return i
}
