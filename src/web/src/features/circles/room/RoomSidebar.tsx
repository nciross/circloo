import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronsLeft, ChevronsRight, ChevronUp, Hand, MessageCircle, Users, X } from 'lucide-react'
import { activeTab, type SideState } from './useSide'

/** One tab of the sidebar. Spec 008 adds Chat and the hands queue; spec 009 adds nothing here (its stage lives in the main area). */
export interface SideTab {
  id: string
  label: string
  icon: ReactNode
  /** A number shown on the tab, with `badgeLabel` read out ("3 unread messages"). */
  badge?: number
  badgeLabel?: string
  panel: ReactNode
}

/**
 * The room's side area. From 960 px: a column on the inline end, collapsible to a narrow handle that still shows unread
 * messages and raised hands. Below 960 px: a bottom sheet, half height by default, expandable, closable; the page keeps
 * room below the content for it, so it never covers the answer pad or the presenter controls (FR-807).
 * Tabs are data: People now, Chat and Hands as their tasks land.
 */
export function RoomSidebar({ tabs, side, unread = 0, hands = 0, announce }: { tabs: SideTab[]; side: SideState; unread?: number; hands?: number; announce?: string }) {
  const { t } = useTranslation()
  const { wide, open, setOpen, sheet, setSheet, setTab: setPicked } = side
  const active = activeTab(tabs, side.tab)
  const base = useId()
  const handle = useRef<HTMLButtonElement>(null)
  const was = useRef(open)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Closing from inside the sidebar would drop focus; the handle that replaces it takes it.
  useEffect(() => {
    if (was.current && !open) handle.current?.focus()
    was.current = open
  }, [open])

  const onTabKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((x) => x.id === active)
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'Home' ? -Infinity : e.key === 'End' ? Infinity : 0
    if (!step) return
    e.preventDefault()
    const next = tabs[Math.min(tabs.length - 1, Math.max(0, step === Infinity ? tabs.length - 1 : step === -Infinity ? 0 : i + step))]
    if (!next) return
    setPicked(next.id)
    tabRefs.current[next.id]?.focus()
  }

  // Escape closes the phone sheet, unless it is clearing a field first (a search or a message being written).
  const onSheetKey = (e: KeyboardEvent) => {
    if (wide || e.key !== 'Escape' || e.defaultPrevented) return
    const field = e.target as HTMLInputElement | HTMLTextAreaElement
    if ((field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') && field.value) return
    setOpen(false)
  }

  const flip = 'room-side__flip'
  return (
    <aside className={`room-side${open ? ' is-open' : ' is-closed'}${!wide && sheet === 'full' ? ' is-full' : ''}`} aria-label={t('circles.room.sideLabel')} data-slot="room-side">
      <button
        ref={handle}
        type="button"
        className="room-side__handle"
        aria-expanded={open}
        aria-controls={`${base}-body`}
        hidden={open}
        onClick={() => setOpen(true)}
      >
        <span className="room-side__handle-icon" aria-hidden="true">{wide ? <ChevronsLeft size={18} className={flip} /> : <Users size={18} />}</span>
        <span className="room-side__handle-label">{t('circles.room.openSide')}</span>
        {unread > 0 ? (
          <span className="room-side__count" title={t('circles.room.unread', { count: unread })}>
            <MessageCircle size={13} aria-hidden="true" />{unread > 99 ? '99+' : unread}
            <span className="visually-hidden"> {t('circles.room.unread', { count: unread })}</span>
          </span>
        ) : null}
        {hands > 0 ? (
          <span className="room-side__count room-side__count--hand" title={t('circles.room.hands', { count: hands })}>
            <Hand size={13} aria-hidden="true" />{hands}
            <span className="visually-hidden"> {t('circles.room.hands', { count: hands })}</span>
          </span>
        ) : null}
      </button>

      <div className="room-side__body" id={`${base}-body`} hidden={!open} onKeyDown={onSheetKey}>
        <div className="room-side__bar">
          {wide ? null : <span className="room-side__grip" aria-hidden="true" />}
          <div className="room-side__tabs" role="tablist" aria-label={t('circles.room.sideLabel')} onKeyDown={onTabKey}>
            {tabs.map((x) => (
              <button
                key={x.id}
                ref={(el) => { tabRefs.current[x.id] = el }}
                type="button"
                role="tab"
                id={`${base}-tab-${x.id}`}
                aria-selected={x.id === active}
                aria-controls={`${base}-panel-${x.id}`}
                tabIndex={x.id === active ? 0 : -1}
                className="room-side__tab"
                onClick={() => setPicked(x.id)}
              >
                <span className="room-side__tab-icon" aria-hidden="true">{x.icon}</span>
                {x.label}
                {x.badge ? (
                  <span className="room-side__badge">
                    {x.badge > 999 ? '999+' : x.badge}
                    <span className="visually-hidden"> {x.badgeLabel}</span>
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="room-side__tools">
            {wide ? (
              <button type="button" className="icon-btn" aria-label={t('circles.room.collapseSide')} title={t('circles.room.collapseSide')} onClick={() => setOpen(false)}>
                <ChevronsRight size={18} aria-hidden="true" className={flip} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={sheet === 'full' ? t('circles.room.shrinkSheet') : t('circles.room.expandSheet')}
                  title={sheet === 'full' ? t('circles.room.shrinkSheet') : t('circles.room.expandSheet')}
                  onClick={() => setSheet(sheet === 'full' ? 'half' : 'full')}
                >
                  {sheet === 'full' ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}
                </button>
                <button type="button" className="icon-btn" aria-label={t('circles.room.closeSheet')} title={t('circles.room.closeSheet')} onClick={() => setOpen(false)}>
                  <X size={18} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
        {tabs.map((x) => (
          <div key={x.id} role="tabpanel" id={`${base}-panel-${x.id}`} aria-labelledby={`${base}-tab-${x.id}`} className="room-side__panel" hidden={x.id !== active}>
            {x.panel}
          </div>
        ))}
        <p className="visually-hidden" aria-live="polite">{announce ?? ''}</p>
      </div>
    </aside>
  )
}
