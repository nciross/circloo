import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useDocumentTitle } from '../../app/locale'
import { PageHeader } from '../../components/PageHeader'
import { Select } from '../../components/Select'
import { Button } from '../../components/Button'
import { useDeckStore } from '../../stores/deck'
import type { Audience, Kind, Tone } from '../../api/sparks'
import { RitualCard } from './RitualCard'
import { RitualLine } from './RitualLine'
import { AskPanel } from './AskPanel'
import { Keepers } from './Keepers'
import '../../styles/app.css'
import '../../styles/icebreakers.css'

const AUDIENCES: Audience[] = ['family', 'friends', 'work']
const TONES: Tone[] = ['silly', 'cozy', 'deep']
const KINDS: Kind[] = ['icebreaker', 'would-you-rather', 'joke', 'riddle']

/** The icebreaker ritual: filters, the current card and the round, fresh AI cards at the side, keepers below. */
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
    <div className="page">
      <PageHeader
        crumbs={[{ to: '/app', label: t('common.nav.home') }]}
        title={t('ice.title')}
        lead={t('ice.lead')}
        actions={
          document.fullscreenEnabled ? (
            <Button variant="default" onClick={toggleFull} icon={full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}>
              {full ? t('ice.stopPresenting') : t('ice.present')}
            </Button>
          ) : null
        }
      />

      <div className="toolbar" role="group" aria-label={t('ice.filters.label')}>
        <Select name="audience" label={t('ice.filters.audience')} value={audience} onChange={(v) => setFilter({ audience: v })}
          options={AUDIENCES.map((v) => ({ value: v, label: t(`ice.filters.audiences.${v}`) }))} />
        <Select name="tone" label={t('ice.filters.tone')} value={tone} onChange={(v) => setFilter({ tone: v })}
          options={TONES.map((v) => ({ value: v, label: t(`ice.filters.tones.${v}`) }))} />
        <Select name="kind" label={t('ice.filters.kind')} value={kind} onChange={(v) => setFilter({ kind: v })}
          options={KINDS.map((v) => ({ value: v, label: t(`ice.filters.kinds.${v}`) }))} />
        <button type="button" className="switch" aria-pressed={kidsSafe} onClick={() => setFilter({ kidsSafe: !kidsSafe })}>
          <span className="switch__track" aria-hidden="true"><span className="switch__knob" /></span>
          {t('ice.filters.kidsSafe')}
        </button>
      </div>

      <div className="ice">
        <div ref={boardRef} className={`ice__board${full ? ' is-full' : ''}`}>
          <RitualCard big={full} />
          <RitualLine onNextCard={nextCard} />
        </div>
        <aside className="ice__side">
          <AskPanel />
        </aside>
      </div>

      <Keepers />
    </div>
  )
}
