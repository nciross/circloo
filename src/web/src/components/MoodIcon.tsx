import { Cloud, CloudFog, CloudLightning, CloudSun, Sun, type LucideProps } from 'lucide-react'

export type Mood = 1 | 2 | 3 | 4 | 5

const ICONS = { 1: CloudLightning, 2: CloudFog, 3: Cloud, 4: CloudSun, 5: Sun } as const

/** Mood is never colour only: always an icon plus a word next to it (PRODUCT.md accessibility). */
export function MoodIcon({ mood, ...props }: { mood: Mood } & LucideProps) {
  const Icon = ICONS[mood]
  return <Icon aria-hidden="true" strokeWidth={2.25} {...props} />
}
