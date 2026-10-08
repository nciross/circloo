import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Crown, Search } from 'lucide-react'
import { Character } from '../../../components/Character'
import { Meter } from '../../../components/Meter'
import type { Member } from '../../../api/circles'
import { peopleRows, windowRows } from './sidebar'

/** Used until a row can be measured (and in tests, where nothing has a size). Matches `--people-row` in room.css at 16 px. */
const ROW_FALLBACK = 68

/**
 * Who is in the circle, as buddy rows on the room's dark card (#250): people here first, then away, each with its
 * character at 44 px, its name, its role and "here" or "away" as the value at the end; the animator is marked by an icon
 * and a label. A search by name on top, and under the list a meter of the people here with "n here · m away" in words.
 * Past 50 rows only the rows in view are drawn (the list keeps its full height, and each row says its place), so 100
 * people stay cheap.
 */
export function PeopleList({ members, online, meId, arrivals = [] }: { members: Member[]; online: string[]; meId?: string; arrivals?: string[] }) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [scroll, setScroll] = useState({ top: 0, height: 0 })
  const [rowHeight, setRowHeight] = useState(ROW_FALLBACK)
  const scroller = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const labelId = useId()
  const { rows, here, away, found } = useMemo(() => peopleRows(members, online, meId, query, i18n.language), [members, online, meId, query, i18n.language])
  const hasRows = rows.length > 0
  const win = windowRows(rows.length, rowHeight, scroll.top, scroll.height)
  const shown = rows.slice(win.start, win.end)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => {
      const row = list.current?.querySelector<HTMLElement>('li')
      if (row && row.offsetHeight > 0) setRowHeight(row.offsetHeight)
      setScroll((s) => (s.height === el.clientHeight ? s : { ...s, height: el.clientHeight }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [hasRows])

  // Windowing space goes through CSSOM custom properties: the CSP forbids style attributes.
  useLayoutEffect(() => {
    list.current?.style.setProperty('--before', `${win.before}px`)
    list.current?.style.setProperty('--after', `${win.after}px`)
  }, [win.before, win.after])

  // A new search starts at the top.
  const search = (value: string) => {
    setQuery(value)
    if (scroller.current) scroller.current.scrollTop = 0
    setScroll((s) => ({ ...s, top: 0 }))
  }

  const summary = t('circles.room.summary', { here, away })
  const people = t('circles.people', { count: members.length })
  return (
    <div className="people">
      <div className="people__search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          className="input"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={t('circles.room.searchPlaceholder')}
          aria-label={t('circles.room.search')}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>
      <p className="visually-hidden" role="status">{query.trim() ? t('circles.room.found', { count: found }) : ''}</p>
      <div
        ref={scroller}
        className="people__scroll"
        role="region"
        aria-label={people}
        tabIndex={0}
        onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
      >
        {rows.length === 0 ? (
          <p className="people__empty field__help">{t('circles.room.none')}</p>
        ) : (
          <ul ref={list} className="people__list" aria-describedby={labelId}>
            {shown.map((r) =>
              r.kind === 'head' ? (
                <li key={r.key} className="people__head" aria-hidden="true">
                  {t(r.key === 'here' ? 'circles.room.groupHere' : 'circles.room.groupAway', { count: r.count })}
                </li>
              ) : (
                <li
                  key={r.member.id}
                  className={`people__row buddy${r.here ? ' is-online' : ' is-away'}${arrivals.includes(r.member.id) ? ' is-new' : ''}`}
                  aria-setsize={found}
                  aria-posinset={r.index + 1}
                >
                  <span className="people__body buddy__char">
                    <Character id={r.member.character} ring={r.member.ring} tag={false} className="people__char" />
                  </span>
                  <span className="people__text">
                    <span className="people__name buddy__name"><bdi>{r.member.name}</bdi>{r.member.id === meId ? <span className="people__you"> ({t('circles.you')})</span> : null}</span>
                    <span className="people__meta buddy__status">
                      {r.member.role === 'animator' ? (
                        <span className="people__role"><Crown size={12} aria-hidden="true" />{t('circles.roles.animator')}</span>
                      ) : (
                        <span className="people__role">{t('circles.roles.participant')}</span>
                      )}
                    </span>
                  </span>
                  <span className={`people__state buddy__value ${r.here ? 'is-ok' : 'is-low'}`}>{r.here ? t('circles.room.valueHere') : t('circles.room.valueAway')}</span>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
      <div className="people__meter">
        <Meter value={here} max={members.length} tone="ok" label={t('circles.room.peopleHere')} />
        <p className="people__summary" id={labelId}>{summary}</p>
      </div>
    </div>
  )
}
