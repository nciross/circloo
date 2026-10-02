/** The cast: every participant in a circle picks one. Ids are stored server side; keep them stable. */
export const CHARACTERS = ['panda', 'fox', 'frog', 'cat', 'owl', 'octopus', 'bear', 'bunny', 'robot', 'ghost', 'chick', 'dino'] as const
export type CharacterId = (typeof CHARACTERS)[number]
export const isCharacter = (v: unknown): v is CharacterId => typeof v === 'string' && (CHARACTERS as readonly string[]).includes(v)
