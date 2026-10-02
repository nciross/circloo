import { Captions } from './brand'
import type { Lang } from './copy'
import { BoardScene } from './scenes/BoardScene'
import { CanvasScene } from './scenes/CanvasScene'
import { ChatScene } from './scenes/ChatScene'
import { CircleScene } from './scenes/CircleScene'
import { PirikooScene } from './scenes/PirikooScene'
import { SendScene } from './scenes/SendScene'

/** The landing page's story steps, in order, with their length in frames (30 fps). */
export const CLIPS = {
  circle: { scene: CircleScene, frames: 120 },
  chat: { scene: ChatScene, frames: 115 },
  canvas: { scene: CanvasScene, frames: 120 },
  board: { scene: BoardScene, frames: 110 },
  send: { scene: SendScene, frames: 85 },
  pirikoo: { scene: PirikooScene, frames: 125 },
} as const

export type ClipId = keyof typeof CLIPS

/** One story clip: the scene without its caption, because the page tells the story beside it. */
export const Clip = ({ clip, lang }: { clip: ClipId; lang: Lang }) => {
  const Scene = CLIPS[clip].scene
  return (
    <Captions.Provider value={false}>
      <Scene lang={lang} />
    </Captions.Provider>
  )
}
