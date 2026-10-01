import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useDocumentTitle } from '../../app/locale'
import { Freezer } from '../../components/Freezer'
import { ChoiceMagnets } from '../../components/ChoiceMagnets'
import { useDeckStore } from '../../stores/deck'
import type { Audience, Kind, Tone } from '../../api/sparks'
import { AccountMenu } from '../home/AccountMenu'
import { RitualCard } from './RitualCard'
import { RitualLine } from './RitualLine'
import { AskFridge } from './AskFridge'
import { Keepers } from './Keepers'
import '../../styles/app.css'
import '../../styles/icebreakers.css'

const AUDIENCES: Audience[] = ['family', 'friends', 'work']
const TONES: Tone[] = ['silly', 'cozy', 'deep']
const KINDS: Kind[] = ['icebreaker', 'would-you-rather', 'joke', 'riddle']

/** The icebreaker ritual: one big card, the people in the room on a magnetic line, and the fridge to ask for more. */
export default function Icebreakers() {
  const { t } = useTranslation()
  useDocumentTitle('ice.title')
  const { audience, tone, kind, kidsSafe, setFilter } = useDeckStore()
  const boardRef = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)
  const nextCard = useDeckStore((s) => s.shake)

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === boardRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await boardRef.current?.requestFullscreen()
    } catch {
      // Some browsers refuse full screen (iOS Safari); the board stays usable in the page.
    }
  }

  return (
    <div className="fridge">
      <Freezer homeTo="/app">
        <AccountMenu />
      </Freezer>
      <main id="main" className="door">
        <span className="door__handle" aria-hidden="true" />
        <h1 className="visually-hidden">{t('ice.title')}</h1>

        <div className="filter-bar" role="group" aria-label={t('ice.filters.label')}>
          <ChoiceMagnets label={t('ice.filters.audience')} value={audience} onChange={(v) => setFilter({ audience: v })}
            choices={AUDIENCES.map((v) => ({ value: v, label: t(`ice.filters.audiences.${v}`) }))} />
          <ChoiceMagnets label={t('ice.filters.tone')} tone="tomato" value={tone} onChange={(v) => setFilter({ tone: v })}
            choices={TONES.map((v) => ({ value: v, label: t(`ice.filters.tones.${v}`) }))} />
          <ChoiceMagnets label={t('ice.filters.kind')} tone="sunflower" value={kind} onChange={(v) => setFilter({ kind: v })}
            choices={KINDS.map((v) => ({ value: v, label: t(`ice.filters.kinds.${v}`) }))} />
          <button type="button" className="kids-switch" aria-pressed={kidsSafe} onClick={() => setFilter({ kidsSafe: !kidsSafe })}>
            <span className="kids-switch__track" aria-hidden="true"><span className="kids-switch__knob" /></span>
            {t('ice.filters.kidsSafe')}
          </button>
        </div>

        <div className="ritual-door">
          <div ref={boardRef} className={`ritual-board${full ? ' is-full' : ''}`}>
            <RitualCard big={full} />
            <RitualLine onNextCard={nextCard} />
            {document.fullscreenEnabled ? <button type="button" className="text-link ritual-board__full" onClick={toggleFull}>
              {full ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
              {full ? t('ice.line.exitFullscreen') : t('ice.line.fullscreen')}
            </button> : null}
          </div>
          <AskFridge />
        </div>

        <Keepers />
      </main>
    </div>
  )
}
