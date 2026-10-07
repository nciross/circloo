// Renders the landing page's story clips and their posters into src/web/public/video/story.
// Usage: node render-clips.mjs [clip ...]   (default: every clip, in every language that has words)
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CLIPS = { circle: 120, chat: 115, canvas: 120, board: 110, send: 85, pirikoo: 125 }
const LANGS = ['en', 'fr', 'ar', 'es']
// Scenes with no words once captions are off: one file serves every language (keep in sync with WORDLESS in src/web/src/features/landing/Player.tsx).
const WORDLESS = ['circle', 'send']
const OUT = '../src/web/public/video/story'
const cli = new URL('./node_modules/@remotion/cli/remotion-cli.js', import.meta.url)
const run = (args) => execFileSync(process.execPath, [fileURLToPath(cli), ...args, '--scale=0.75', '--log=error'], { stdio: 'inherit' })

mkdirSync(OUT, { recursive: true })
const only = process.argv.slice(2)
for (const [clip, frames] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(clip)) continue
  for (const lang of WORDLESS.includes(clip) ? ['en'] : LANGS) {
    const id = `Clip-${clip}-${lang}`
    const name = WORDLESS.includes(clip) ? clip : `${clip}-${lang}`
    console.log(id)
    // 960×540, silent, small: a few seconds of flat UI compress well.
    run(['render', id, `${OUT}/${name}.mp4`, '--codec=h264', '--crf=28', '--muted'])
    // The poster is the finished scene, so people who never play it still see the whole picture.
    run(['still', id, `${OUT}/${name}.jpg`, `--frame=${frames - 12}`, '--image-format=jpeg', '--jpeg-quality=78'])
  }
}
