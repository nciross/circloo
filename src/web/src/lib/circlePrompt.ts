/**
 * The line typed on the landing travels to the new-circle page through session storage (issue #247): it survives the
 * sign-in round trip in this tab and never reaches the server until the animator creates the circle.
 */
const KEY = 'circloo-circle-prompt'
export const PROMPT_MAX = 200

export function keepPrompt(text: string) {
  try {
    sessionStorage.setItem(KEY, text.trim().slice(0, PROMPT_MAX))
  } catch {
    /* storage blocked: the person types it again on the next page */
  }
}

export function readPrompt(): string {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearPrompt() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
