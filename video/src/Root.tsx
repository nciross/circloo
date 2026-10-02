import { Composition, Folder } from 'remotion'
import { Tour } from './Tour'
import { Intro } from './scenes/Intro'
import { CircleScene } from './scenes/CircleScene'
import { ChatScene } from './scenes/ChatScene'
import { BoardScene } from './scenes/BoardScene'
import { SendScene } from './scenes/SendScene'
import { Outro } from './scenes/Outro'
import { CanvasScene } from './scenes/CanvasScene'
import { PirikooScene } from './scenes/PirikooScene'
import { Clip, CLIPS, type ClipId } from './Clip'
import type { Lang } from './copy'

const LANGS: Lang[] = ['en', 'fr', 'ar', 'es']

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Tour-en" component={Tour} durationInFrames={554} fps={30} width={1280} height={720} defaultProps={{ lang: 'en' as const }} />
      <Composition id="Tour-fr" component={Tour} durationInFrames={554} fps={30} width={1280} height={720} defaultProps={{ lang: 'fr' as const }} />
      <Composition id="Tour-ar" component={Tour} durationInFrames={554} fps={30} width={1280} height={720} defaultProps={{ lang: 'ar' as const }} />
      <Composition id="Tour-es" component={Tour} durationInFrames={554} fps={30} width={1280} height={720} defaultProps={{ lang: 'es' as const }} />
      <Folder name="Scenes">
        <Composition id="Intro" component={Intro} durationInFrames={100} fps={30} width={1280} height={720} defaultProps={{ lang: 'en' as const }} />
        <Composition id="Circle" component={CircleScene} durationInFrames={120} fps={30} width={1280} height={720} defaultProps={{ lang: 'en' as const }} />
        <Composition id="Chat" component={ChatScene} durationInFrames={115} fps={30} width={1280} height={720} defaultProps={{ lang: 'en' as const }} />
        <Composition id="Board" component={BoardScene} durationInFrames={110} fps={30} width={1280} height={720} defaultProps={{ lang: 'en' as const }} />
        <Composition id="Send" component={SendScene} durationInFrames={85} fps={30} width={1280} height={720} defaultProps={{ lang: 'en' as const }} />
        <Composition id="Canvas" component={CanvasScene} durationInFrames={120} fps={30} width={1280} height={720} defaultProps={{ lang: 'en' as const }} />
        <Composition id="Pirikoo" component={PirikooScene} durationInFrames={125} fps={30} width={1280} height={720} defaultProps={{ lang: 'en' as const }} />
        <Composition id="Outro" component={Outro} durationInFrames={90} fps={30} width={1280} height={720} defaultProps={{ lang: 'en' as const }} />
      </Folder>
      {/* Story clips for the landing page: one per step and language, captions off. */}
      <Folder name="Clips">
        {LANGS.flatMap((lang) =>
          (Object.keys(CLIPS) as ClipId[]).map((clip) => (
            <Composition key={`${clip}-${lang}`} id={`Clip-${clip}-${lang}`} component={Clip} durationInFrames={CLIPS[clip].frames} fps={30} width={1280} height={720} defaultProps={{ clip, lang }} />
          )),
        )}
      </Folder>
    </>
  )
}
