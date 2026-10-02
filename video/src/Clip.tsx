import { AbsoluteFill } from 'remotion'
import { CANVAS, Captions } from './brand'
import type { Lang } from './copy'
import { BoardScene } from './scenes/BoardScene'
import { CanvasScene } from './scenes/CanvasScene'
import { ChatScene } from './scenes/ChatScene'
import { CircleScene } from './scenes/CircleScene'
import { PirikooScene } from './scenes/PirikooScene'
import { SendScene } from './scenes/SendScene'

/**
 * The landing page's story steps, in order, with their length in frames (30 fps). Scenes leave room at the bottom
 * for a caption; without it, `shift` (px at 720p) and `zoom` bring their content back to the middle of the frame.
 */
export const CLIPS = {
  circle: { scene: CircleScene, frames: 120, shift: 62, zoom: 1.05 },
  chat: { scene: ChatScene, frames: 115, shift: 62, zoom: 1.05 },
  canvas: { scene: CanvasScene, frames: 120, shift: 0, zoom: 1 },
  board: { scene: BoardScene, frames: 110, shift: 60, zoom: 1.05 },
  send: { scene: SendScene, frames: 85, shift: 155, zoom: 1.25 },
  pirikoo: { scene: PirikooScene, frames: 125, shift: 0, zoom: 1 },
} as const

export type ClipId = keyof typeof CLIPS

/** One story clip: the scene without its caption, because the page tells the story beside it. */
export const Clip = ({ clip, lang }: { clip: ClipId; lang: Lang }) => {
  const { scene: Scene, shift, zoom } = CLIPS[clip]
  return (
    <Captions.Provider value={false}>
      <AbsoluteFill style={{ background: CANVAS, overflow: 'hidden' }}>
        <AbsoluteFill style={{ transform: `translateY(${shift}px) scale(${zoom})`, transformOrigin: '50% 40%' }}>
          <Scene lang={lang} />
        </AbsoluteFill>
      </AbsoluteFill>
    </Captions.Provider>
  )
}
