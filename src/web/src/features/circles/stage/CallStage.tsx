import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, LayoutGrid, RectangleHorizontal } from 'lucide-react'
import type { Member } from '../../../api/circles'
import { Character } from '../../../components/Character'
import { Segmented } from '../../../components/Segmented'
import { CallTile } from './CallTile'
import { PersonMenu } from './PersonMenu'
import { useCompact } from './compact'
import { PAGE_SIZE, nextSpeaker, pageOf, syncVideos } from './grid'
import { useStage } from './stage'

type Layout = 'grid' | 'speaker'

/**
 * The call in the centre of the room (spec 009 US2, T925): a grid that fills the centre, or the speaker large with the
 * others in a strip. Pages of 9 tiles on a computer and 4 on a phone, your own preview on each; the active speaker always
 * on screen. Only the videos on the page are received (SC-912). The controls are a separate bar (CallControls). The
 * animator finds each participant's menu on their tile (T926).
 */
export function CallStage({ members, floor: viewFloor, isAnimator = false }: { members: Member[]; floor: string | null; isAnimator?: boolean }) {
  const { t } = useTranslation()
  const participants = useStage((s) => s.participants)
  const roster = useStage((s) => s.roster)
  const connection = useStage((s) => s.connection)
  const liveHands = useStage((s) => s.hands)
  const floor = liveHands ? liveHands.floor : viewFloor
  const compact = useCompact()
  const [picked, setLayout] = useState<Layout>('grid')
  // Four tiles on a phone are already large: the grid it is, and the switch goes.
  const layout: Layout = compact ? 'grid' : picked
  const [page, setPage] = useState(0)
  const [speaker, setSpeaker] = useState<string | null>(null)
  const next = nextSpeaker(speaker, participants)
  if (next !== speaker) setSpeaker(next)

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const animators = useMemo(() => new Set(members.filter((m) => m.role === 'animator').map((m) => m.id)), [members])
  const view = pageOf(participants, { animators, floor, joined: roster }, next, compact ? PAGE_SIZE.compact : PAGE_SIZE.wide, page)
  if (view.page !== page) setPage(view.page)
  const shownKey = view.tiles.map((p) => p.id).join(' ')

  // Only the page's videos come down; everything else is switched off at the call server, and all of it when the grid goes.
  useEffect(() => {
    syncVideos(participants, new Set(shownKey.split(' ')))
  }, [participants, shownKey])
  useEffect(() => () => syncVideos(useStage.getState().participants, null), [])

  const me = participants.find((p) => p.local)
  const meMember = me ? byId.get(me.id) : undefined
  const alone = connection !== 'joining' && view.tiles.length === 1 && !!me
  const pageText = t('circles.call.page', { page: view.page + 1, pages: view.pages })

  return (
    <div className="call-stage" data-layout={layout}>
      <h2 className="visually-hidden">{t('circles.call.stageTitle')}</h2>
      {compact && view.pages < 2 ? null : (
        <div className="call-stage__bar">
          {compact ? null : (
            <Segmented
              label={t('circles.call.layout')}
              hideLabel
              className="call-stage__layout"
              value={layout}
              onChange={setLayout}
              choices={[
                { value: 'grid', label: t('circles.call.grid'), icon: <LayoutGrid size={16} /> },
                { value: 'speaker', label: t('circles.call.speakerView'), icon: <RectangleHorizontal size={16} /> },
              ]}
            />
          )}
          {view.pages > 1 ? (
            <nav className="call-stage__pages" aria-label={t('circles.call.pages')}>
              <button
                type="button"
                className="icon-btn call-stage__page-btn"
                aria-label={t('circles.call.prevPage')}
                title={t('circles.call.prevPage')}
                aria-disabled={view.page === 0 || undefined}
                onClick={() => view.page > 0 && setPage(view.page - 1)}
              >
                <ChevronLeft size={20} aria-hidden="true" className="flip-rtl" />
              </button>
              <span className="call-stage__page" aria-live="polite">{pageText}</span>
              <button
                type="button"
                className="icon-btn call-stage__page-btn"
                aria-label={t('circles.call.nextPage')}
                title={t('circles.call.nextPage')}
                aria-disabled={view.page === view.pages - 1 || undefined}
                onClick={() => view.page < view.pages - 1 && setPage(view.page + 1)}
              >
                <ChevronRight size={20} aria-hidden="true" className="flip-rtl" />
              </button>
            </nav>
          ) : null}
        </div>
      )}
      {connection === 'joining' ? (
        <div className="call-stage__joining" role="status">
          {meMember ? <Character id={meMember.character} ring={meMember.ring} tag={false} className="call-stage__joining-char" /> : null}
          <p>{t('circles.call.joining')}</p>
        </div>
      ) : (
        <ul
          className="call-stage__grid"
          data-count={view.tiles.length}
          style={{ '--strip': Math.max(1, view.tiles.length - 1) } as CSSProperties}
          aria-label={view.pages > 1 ? t('circles.call.tilesPaged', { page: view.page + 1, pages: view.pages }) : t('circles.call.tiles')}
        >
          {view.tiles.map((p, i) => (
            <CallTile
              key={p.id}
              person={p}
              member={byId.get(p.id)}
              floor={p.id === floor}
              big={layout === 'speaker' && i === 0 && view.tiles.length > 1}
              menu={isAnimator && !p.local && !animators.has(p.id) ? <PersonMenu memberId={p.id} name={byId.get(p.id)?.name || p.name} /> : undefined}
            />
          ))}
        </ul>
      )}
      {alone ? <p className="call-stage__alone">{t('circles.call.alone')}</p> : null}
    </div>
  )
}
