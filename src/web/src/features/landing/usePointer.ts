import { useEffect, type RefObject } from 'react'

/**
 * The hero follows the mouse (#250): writes the pointer's place over the element as `--px` and `--py` (-1 to 1, from
 * its centre), once per frame, so CSS can tilt the board and drift the pictures at different depths. Only with a
 * fine pointer that can hover (no touch), only while `enabled`; it eases back to the centre when the pointer leaves.
 */
export function usePointer(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let fine = false
    try {
      fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    } catch {
      fine = false
    }
    if (!fine) return
    let frame = 0
    const set = (x: number, y: number) => {
      el.style.setProperty('--px', x.toFixed(3))
      el.style.setProperty('--py', y.toFixed(3))
    }
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect()
        const x = ((e.clientX - box.left) / box.width) * 2 - 1
        const y = ((e.clientY - box.top) / box.height) * 2 - 1
        set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)))
      })
    }
    const onLeave = () => {
      cancelAnimationFrame(frame)
      set(0, 0)
    }
    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      set(0, 0)
    }
  }, [ref, enabled])
}
