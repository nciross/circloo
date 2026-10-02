import { linearTiming, TransitionSeries } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { useVideoConfig } from 'remotion'
import type { Lang } from './copy'
import { Intro } from './scenes/Intro'
import { CircleScene } from './scenes/CircleScene'
import { ChatScene } from './scenes/ChatScene'
import { BoardScene } from './scenes/BoardScene'
import { SendScene } from './scenes/SendScene'
import { Outro } from './scenes/Outro'

export type TourProps = { readonly lang: Lang }

/** The 20-second circloo tour: face, circle, chat, board, send, invitation. */
export const Tour = ({ lang }: TourProps) => {
  const { fps } = useVideoConfig()
  const forward = lang === 'ar' ? 'from-left' : 'from-right'
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Intro" durationInFrames={100} premountFor={fps}>
        <Intro lang={lang} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence name="Circle" durationInFrames={120} premountFor={fps}>
        <CircleScene lang={lang} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: forward })} timing={linearTiming({ durationInFrames: 14 })} />
      <TransitionSeries.Sequence name="Chat" durationInFrames={115} premountFor={fps}>
        <ChatScene lang={lang} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: forward })} timing={linearTiming({ durationInFrames: 14 })} />
      <TransitionSeries.Sequence name="Board" durationInFrames={110} premountFor={fps}>
        <BoardScene lang={lang} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: forward })} timing={linearTiming({ durationInFrames: 14 })} />
      <TransitionSeries.Sequence name="Send" durationInFrames={85} premountFor={fps}>
        <SendScene lang={lang} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
      <TransitionSeries.Sequence name="Outro" durationInFrames={90} premountFor={fps}>
        <Outro lang={lang} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  )
}

/** Total length: scenes minus transition overlaps. */
export const TOUR_FRAMES = 100 + 120 + 115 + 110 + 85 + 90 - (12 + 14 + 14 + 14 + 12)
