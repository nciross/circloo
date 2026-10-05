import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every file under src, as a path relative to src. */
function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full, base) : [full.slice(base.length + 1)]
  })
}

describe('file names', () => {
  it('never differ only by letter case (Windows and macOS would treat them as one file)', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const path of walk(join(__dirname, '..'))) {
      // Ignore the extension too: Avatar.tsx and avatar.ts both resolve from "./avatar" there.
      const key = path.replace(/\.(tsx?|css|json)$/i, '').toLowerCase()
      const other = seen.get(key)
      if (other && other !== path) clashes.push(`${other} <-> ${path}`)
      seen.set(key, path)
    }
    expect(clashes).toEqual([])
  })
})
