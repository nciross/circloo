export type MeterTone = 'ok' | 'mid' | 'low' | 'ink' | 'beam'

/** Which tone a share deserves: full or nearly is ok, half is mid, little or nothing is low. */
export const toneFor = (value: number, max: number): MeterTone => {
  if (max <= 0) return 'low'
  const share = value / max
  return share >= 0.7 ? 'ok' : share >= 0.3 ? 'mid' : 'low'
}
