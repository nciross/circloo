import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Crown, Play } from 'lucide-react'
import { Character } from '../../components/Character'
import { CHARACTERS, type AnyCharacter } from '../../components/characters'
import { AvatarBuilder } from '../../components/AvatarBuilder'
import { GALLERY, isAvatarCode } from '../../components/avatarCode'
import { Button } from '../../components/Button'
import { Segmented } from '../../components/Segmented'
import { joinLink, type Member } from '../../api/circles'
import { ACTIVITIES, CATEGORIES, type Category } from './catalog'

type PickTab = 'friends' | 'people' | 'build'

/** How many people use a character in a circle and which of its rings are free (spec 008). */
export interface CharacterUse {
  id: AnyCharacter
  used: number
  freeRings: number[]
}

/**
 * Three ways to choose (friends, people, build your own), as a native radio group in each: arrow keys move; a character
 * with no free ring left is disabled and says so. With `uses` (joining a circle), characters already picked by others
 * show how many people use them: they can be shared, each person with their own ring (spec 008).
 */
export function CharacterPicker({
  value, onChange, taken = [], uses, pickedRing = 0, legend, describedBy, invalid,
}: {
  value: AnyCharacter | null
  onChange: (c: AnyCharacter) => void
  taken?: string[]
  uses?: CharacterUse[]
  /** The ring the picked character will wear, drawn on its tile so a one-tap joiner sees it. */
  pickedRing?: number
  legend: string
  describedBy?: string
  invalid?: boolean
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<PickTab>(() => (isAvatarCode(value) ? (GALLERY.includes(value) ? 'people' : 'build') : 'friends'))
  const item = (c: AnyCharacter, name: string, compact = false) => {
    const use = uses?.find((u) => u.id === c)
    const isTaken = (use ? use.freeRings.length === 0 : taken.includes(c)) && c !== value
    const shared = !isTaken && (use?.used ?? 0) > 0
    return (
      <label key={c} className={`pick__item${compact ? ' pick__item--small' : ''}${value === c ? ' is-picked' : ''}${isTaken ? ' is-taken' : ''}`}>
        <input type="radio" name="character" value={c} checked={value === c} disabled={isTaken} onChange={() => onChange(c)} aria-label={compact ? name : undefined} />
        <Character id={c} ring={value === c ? pickedRing : 0} tag={!compact} className="pick__char" />
        {compact ? null : <span className="pick__name">{name}</span>}
        {isTaken ? <span className="pick__taken">{t(uses ? 'circles.join.characterFull' : 'circles.taken')}</span> : null}
        {shared && !compact ? <span className="pick__used">{t('circles.join.used', { count: use!.used })}</span> : null}
      </label>
    )
  }
  return (
    <fieldset className="pick" aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      <legend className="field__label">{legend}</legend>
      <Segmented
        label={legend}
        hideLabel
        className="pick__tabs"
        value={tab}
        onChange={setTab}
        choices={[
          { value: 'friends', label: t('avatar.tabs.friends', { count: CHARACTERS.length }) },
          { value: 'people', label: t('avatar.tabs.people', { count: GALLERY.length }) },
          { value: 'build', label: t('avatar.tabs.build') },
        ]}
      />
      {tab === 'friends' ? <div className="pick__grid">{CHARACTERS.map((c) => item(c, t(`characters.${c}`)))}</div> : null}
      {tab === 'people' ? <div className="pick__grid pick__grid--small">{GALLERY.map((c, i) => item(c, t('avatar.person', { n: i + 1 }), true))}</div> : null}
      {tab === 'build' ? <AvatarBuilder code={isAvatarCode(value) ? value : null} onChange={onChange} /> : null}
    </fieldset>
  )
}

/**
 * Which copy of a character to be, when others already use it (spec 008): each free ring as the character wearing
 * it, numbered, so the choice never rests on colour alone. The lowest free ring is chosen until the person picks.
 */
export function RingPicker({ character, freeRings, value, onChange }: {
  character: AnyCharacter
  freeRings: number[]
  value: number
  onChange: (ring: number) => void
}) {
  const { t } = useTranslation()
  const help = useId()
  return (
    <fieldset className="rings" aria-describedby={help}>
      <legend className="field__label">{t('circles.join.ringLegend')}</legend>
      <p id={help} className="field__help rings__help">{t('circles.join.ringHelp', { n: value + 1 })}</p>
      <div className="rings__grid">
        {freeRings.map((r) => (
          <label key={r} className={`rings__item${value === r ? ' is-picked' : ''}`}>
            <input type="radio" name="ring" value={r} checked={value === r} onChange={() => onChange(r)} />
            <Character id={character} ring={r} className="rings__char" />
            <span className="rings__name">{r === 0 ? t('circles.join.ringNone') : t('circles.join.ringOption', { n: r + 1 })}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** The people in the circle, seated on a ring. Online people are bright; away people are faded and say so. */
export function PeopleRing({ members, online, meId, arrivals = [] }: { members: Member[]; online: string[]; meId?: string; arrivals?: string[] }) {
  const { t } = useTranslation()
  const count = members.length
  return (
    <div className="ring">
      <ul className="ring__seats" aria-label={t('circles.people', { count })}>
        {members.map((m, i) => {
          const isOnline = online.includes(m.id)
          return (
            <li
              key={m.id}
              className={`ring__seat${isOnline ? ' is-online' : ''}${arrivals.includes(m.id) ? ' is-new' : ''}`}
              // Seat angle through CSSOM (the CSP forbids style attributes, not custom properties set from script).
              ref={(el) => el?.style.setProperty('--a', `${(i * 360) / Math.max(count, 1)}deg`)}
            >
              <span className="ring__body">
                {arrivals.includes(m.id) ? (
                  <span className="ring__hearts" aria-hidden="true">
                    {[0, 1, 2].map((h) => (
                      <svg key={h} className={`ring__heart ring__heart--${h}`} viewBox="0 0 24 24">
                        <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
                      </svg>
                    ))}
                  </span>
                ) : null}
                <Character id={m.character} ring={m.ring} className="ring__char" />
                <span className="ring__name">
                  {m.role === 'animator' ? <Crown size={12} aria-hidden="true" /> : null}
                  <bdi>{m.name}</bdi>
                  {m.id === meId ? <span className="visually-hidden"> ({t('circles.you')})</span> : null}
                </span>
                <span className="visually-hidden">
                  {m.role === 'animator' ? `, ${t('circles.roles.animator')}` : ''}, {isOnline ? t('circles.online') : t('circles.away')}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="ring__count" aria-hidden="true">
        <span className="ring__online">{online.length}</span> / {count}
      </p>
    </div>
  )
}

/** The link and code to share, with a copy button that confirms. */
export function InviteCard({ code, fresh = false }: { code: string; fresh?: boolean }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const link = joinLink(code)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <section className={`panel invite${fresh ? ' is-fresh' : ''}`} aria-labelledby="invite-title" data-perch="invite">
      <div className="panel__head">
        <h2 id="invite-title" className="panel__title">{t('circles.invite.title')}</h2>
      </div>
      <div className="panel__body">
        <p className="field__help">{fresh ? t('circles.invite.ready') : t('circles.invite.body')}</p>
        <div className="invite__row">
          <input className="input invite__link" readOnly value={link} aria-label={t('circles.invite.link')} dir="ltr" onFocus={(e) => e.currentTarget.select()} />
          <Button variant="default" onClick={copy} icon={copied ? <Check size={16} /> : <Copy size={16} />}>
            {copied ? t('circles.invite.copied') : t('circles.invite.copy')}
          </Button>
        </div>
        <p className="invite__code">
          {t('circles.invite.code')} <strong className="invite__code-value" dir="ltr">{code}</strong>
        </p>
        <p className="visually-hidden" aria-live="polite">{copied ? t('circles.invite.copied') : ''}</p>
      </div>
    </section>
  )
}

/** Activity cards by category. In "choose" mode they toggle; in "start" mode each starts the activity. */
export function ActivityGrid({
  ids, mode, selected = [], onToggle, onStart, busy,
}: {
  ids?: string[]
  mode: 'choose' | 'start'
  selected?: string[]
  onToggle?: (id: string) => void
  onStart?: (id: string) => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const pool = ACTIVITIES.filter((a) => !ids || ids.includes(a.id))
  const present = CATEGORIES.filter((c) => pool.some((a) => a.category === c))
  const [category, setCategory] = useState<Category | 'all'>('all')
  const shown = pool.filter((a) => category === 'all' || a.category === category)
  return (
    <div className="activities">
      {present.length > 1 ? (
        <Segmented<Category | 'all'>
          label={t('activities.category')}
          hideLabel
          value={category}
          onChange={setCategory}
          choices={[{ value: 'all', label: t('activities.all') }, ...present.map((c) => ({ value: c, label: t(`activities.categories.${c}`) }))]}
        />
      ) : null}
      <ul className="activities__grid">
        {shown.map(({ id, icon: Icon, category: cat }) => {
          const on = selected.includes(id)
          return (
            <li key={id} className={`activity activity--${cat}${on ? ' is-on' : ''}`} data-activity={id}>
              <span className="activity__icon" aria-hidden="true"><Icon size={20} /></span>
              <div className="activity__copy">
                <h3 className="activity__title">{t(`activities.${id}.title`)}</h3>
                <p className="activity__body">{t(`activities.${id}.body`)}</p>
                <span className="activity__cat">{t(`activities.categories.${cat}`)}</span>
              </div>
              {mode === 'choose' ? (
                <button type="button" className="activity__toggle" aria-pressed={on} onClick={() => onToggle?.(id)}>
                  <span className="visually-hidden">{t(`activities.${id}.title`)}: </span>
                  {on ? <Check size={16} aria-hidden="true" /> : null}
                  {on ? t('circles.create.added') : t('circles.create.add')}
                </button>
              ) : (
                <Button size="sm" busy={busy} onClick={() => onStart?.(id)} icon={<Play size={14} />} aria-label={`${t('circles.room.start')}: ${t(`activities.${id}.title`)}`}>
                  {t('circles.room.start')}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
