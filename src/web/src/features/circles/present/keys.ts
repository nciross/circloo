/** What a key press means in the presenter view. */
export type KeyAction = 'next' | 'prev' | 'blank' | null

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'repeat' | 'isComposing' | 'defaultPrevented'> & {
  target: EventTarget | null
}

/** Controls that use these keys themselves: typing, menus, sliders. */
const OWN_KEYS = 'input, textarea, select, [role="menu"], [role="menuitem"], [role="listbox"], [role="slider"], [role="spinbutton"]'
/** Space keeps pressing the focused control. */
const PRESSABLE = 'button, a, summary, [role="button"], [role="radio"], [role="switch"], [role="checkbox"]'

/**
 * Presenter shortcuts (spec 006 US3 #2, #3, #8). "Next" follows the reading direction, so in Arabic the left arrow goes
 * forward; Page Up/Down and Space work in every language. B is matched on the physical key so it works on an Arabic
 * layout too. Held keys do not repeat, and keys typed into fields or used by menus and sliders are left alone.
 */
export function keyAction(e: KeyLike, rtl: boolean): KeyAction {
  if (e.altKey || e.ctrlKey || e.metaKey || e.repeat || e.isComposing || e.defaultPrevented) return null
  const target = e.target instanceof Element ? e.target : null
  if (target && ((target as HTMLElement).isContentEditable || target.closest(OWN_KEYS))) return null
  if (e.key === ' ' && target?.closest(PRESSABLE)) return null
  if (e.code === 'KeyB') return 'blank'
  switch (e.key) {
    case 'PageDown':
    case ' ':
      return 'next'
    case 'PageUp':
      return 'prev'
    case 'ArrowRight':
      return rtl ? 'prev' : 'next'
    case 'ArrowLeft':
      return rtl ? 'next' : 'prev'
    default:
      return null
  }
}
