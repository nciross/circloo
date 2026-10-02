import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'

const ITEMS = 'a[href], button:not([disabled])'

/**
 * A disclosure popover (button + panel): opens on activation, closes on Escape, outside press or
 * tabbing away, and returns focus to its trigger. Arrow keys, Home and End move between items.
 */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    // Start on the selected item when there is one, else the first.
    const panel = panelRef.current
    ;(panel?.querySelector<HTMLElement>('[aria-current="true"]') ?? panel?.querySelector<HTMLElement>(ITEMS))?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])]
    if (!items.length) return
    e.preventDefault()
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const to = e.relatedTarget as Node | null
    if (to && !panelRef.current?.contains(to) && to !== triggerRef.current) setOpen(false)
  }

  return {
    open,
    toggle: () => setOpen((o) => !o),
    close,
    triggerRef,
    panelRef,
    panelProps: { onKeyDown, onBlur },
  }
}
