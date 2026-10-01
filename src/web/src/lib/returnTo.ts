/** Only same-site paths are honoured as return targets (FR-019, no open redirect). */
export function safeReturnTo(value: string | null | undefined, fallback = '/app'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
