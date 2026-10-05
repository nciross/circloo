/**
 * A build-your-own character is a short id: "me:" and one digit per option. The id is validated by the API
 * (Avatars in CircleRules.cs), so keep the option counts in step with it.
 */
export const AVATAR_FIELDS = ['face', 'skin', 'hair', 'hairColor', 'beard', 'glasses', 'outfit', 'mouth'] as const
export type AvatarField = (typeof AVATAR_FIELDS)[number]
export const AVATAR_COUNTS: Record<AvatarField, number> = { face: 4, skin: 6, hair: 9, hairColor: 8, beard: 5, glasses: 4, outfit: 8, mouth: 4 }
export type Avatar = Record<AvatarField, number>
export type AvatarCode = `me:${string}`

export const SKIN = ['#ffe0c7', '#f6cfa6', '#e0ac80', '#c68642', '#8d5524', '#5c3a21']
export const HAIR = ['#1f1a17', '#4a2e1a', '#8a5a2b', '#d9a441', '#c8452b', '#9aa0a6', '#ececec', '#6a4fd1']
export const OUTFIT = ['#e5383b', '#f28c38', '#ffd23f', '#4fb84e', '#2b9fb8', '#2457c5', '#6a4fd1', '#ff6f91']

export const DEFAULT_AVATAR: Avatar = { face: 1, skin: 1, hair: 1, hairColor: 1, beard: 0, glasses: 0, outfit: 5, mouth: 0 }

export const encodeAvatar = (a: Avatar): AvatarCode => `me:${AVATAR_FIELDS.map((f) => a[f]).join('')}`

export const isAvatarCode = (v: unknown): v is AvatarCode =>
  typeof v === 'string' && v.length === 3 + AVATAR_FIELDS.length && v.startsWith('me:') &&
  AVATAR_FIELDS.every((f, i) => {
    const d = v.charCodeAt(3 + i) - 48
    return d >= 0 && d < AVATAR_COUNTS[f]
  })

export function decodeAvatar(code: string): Avatar {
  if (!isAvatarCode(code)) return DEFAULT_AVATAR
  return Object.fromEntries(AVATAR_FIELDS.map((f, i) => [f, code.charCodeAt(3 + i) - 48])) as Avatar
}

export const randomAvatar = (): Avatar =>
  Object.fromEntries(AVATAR_FIELDS.map((f) => [f, Math.floor(Math.random() * AVATAR_COUNTS[f])])) as Avatar

/** A small seeded generator, so the gallery is the same for everyone and on every visit. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const GALLERY_SIZE = 160

/**
 * Ready-made people, picked at random once (fixed seed) but spread evenly over skin tones and outfit colours, with every
 * hair style and beard shown often. Any of them is also a starting point for the builder.
 */
export const GALLERY: AvatarCode[] = (() => {
  const rand = mulberry32(205)
  const pick = (n: number) => Math.floor(rand() * n)
  const seen = new Set<string>()
  const out: AvatarCode[] = []
  while (out.length < GALLERY_SIZE) {
    const i = out.length
    const a: Avatar = {
      face: pick(AVATAR_COUNTS.face),
      skin: i % AVATAR_COUNTS.skin,
      hair: pick(AVATAR_COUNTS.hair),
      hairColor: pick(AVATAR_COUNTS.hairColor),
      beard: rand() < 0.35 ? 1 + pick(AVATAR_COUNTS.beard - 1) : 0,
      glasses: rand() < 0.3 ? 1 + pick(AVATAR_COUNTS.glasses - 1) : 0,
      outfit: (i * 3) % AVATAR_COUNTS.outfit,
      mouth: pick(AVATAR_COUNTS.mouth),
    }
    const code = encodeAvatar(a)
    if (!seen.has(code)) {
      seen.add(code)
      out.push(code)
    }
  }
  return out
})()
