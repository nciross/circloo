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

let joinPressed = false

/** Join call was pressed: once the call's bar is there, the focus moves on to it (see `focusOnBar`). */
export function markJoin() {
  joinPressed = true
}

/**
 * Joining removes Join call, and on a phone the call folds the sheet that held it, which hands the focus to the sheet's
 * pill: either way the focus moves on to the call's bar once it is there, unless the person went somewhere else since.
 */
export function focusOnBar(): boolean {
  const pressed = joinPressed
  joinPressed = false
  const now = document.activeElement
  if (!now || now === document.body) return true
  return pressed && now.matches('.call__join, .room-side__handle')
}
