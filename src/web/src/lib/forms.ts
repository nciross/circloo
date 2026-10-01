export const NAME_MAX = 40

/** Display name rule shared with the API: 1–40 characters after trimming. */
export function validName(raw: string) {
  const name = raw.trim()
  return name.length >= 1 && name.length <= NAME_MAX
}

/** Accepts pasted codes with spaces or dashes; keeps at most six digits. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6)
}
