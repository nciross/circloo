/**
 * Where the focus goes when the control that held it goes with the call (T914, WCAG 2.4.3). Leaving removes the call's
 * bar, and Leave in the Call tab turns into Join call: the focus waits on Join call when its tab is open, otherwise on
 * the room's centre, never on the page itself.
 */
export function focusAfterLeave() {
  requestAnimationFrame(() => {
    const now = document.activeElement
    if (now && now !== document.body) return
    const join = document.querySelector<HTMLElement>('.call__join')
    // A Join call in a tab that is not open (a hidden panel, a closed sheet) is no place for the focus.
    if (join && !join.closest('[hidden]')) join.focus()
    else document.getElementById('room-centre')?.focus()
  })
}

/** Joining removes Join call: the focus moves on to the call's bar rather than falling to the page. */
export function focusLost(): boolean {
  const now = document.activeElement
  return !now || now === document.body
}
