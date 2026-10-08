import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ArrowRight, ListChecks } from 'lucide-react'
import { ApiError } from '../../api/client'
import { useCreateCircle } from '../../api/circles'
import { useDocumentTitle } from '../../app/locale'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { Character } from '../../components/Character'
import { Meter } from '../../components/Meter'
import { Segmented } from '../../components/Segmented'
import type { AnyCharacter } from '../../components/characters'
import { useUiStore } from '../../stores/ui'
import { clearPrompt, PROMPT_MAX, readPrompt } from '../../lib/circlePrompt'
import { compose } from '../landing/compose'
import { ActivityGrid, CharacterPicker } from './parts'
import { MAX_ACTIVITIES } from './catalog'
import '../../styles/circles.css'

const NAME_MAX = 60
type Mode = 'describe' | 'manual'

/**
 * Animator: name the circle, pick your character and the activities, get a link. "Describe it" fills the name and the
 * activities from one line (the landing's composer, #247); "By hand" is the plain form. Every field stays editable.
 * The form runs down the left; the one dark card on the right shows what will open and holds the submit.
 */
export default function CreateCircle() {
  const { t } = useTranslation()
  useDocumentTitle('circles.create.title')
  const navigate = useNavigate()
  const locale = useUiStore((s) => s.locale)
  const create = useCreateCircle()
  const [line, setLine] = useState(() => readPrompt())
  const [mode, setMode] = useState<Mode>(() => (readPrompt() ? 'describe' : 'manual'))
  const [name, setName] = useState('')
  const [character, setCharacter] = useState<AnyCharacter | null>('panda')
  const [activities, setActivities] = useState<string[]>(['quick-question'])
  const [suggested, setSuggested] = useState(false)
  const [applied, setApplied] = useState('')
  const [errors, setErrors] = useState<{ name?: string; activities?: string; character?: string; form?: string }>({})
  const nameId = useId()
  const nameErr = useId()
  const actErr = useId()
  const lineId = useId()
  const lineHelp = useId()
  const seeded = useRef(false)

  const suggest = (text: string) => {
    const c = compose(text, locale)
    setName(t(`landing.made.names.${c.name}`))
    setActivities(c.activities)
    setSuggested(true)
    setApplied(t('circles.create.applied'))
    setErrors({})
  }

  // The line from the landing fills the form once, on arrival, and is then forgotten: a later New circle starts plain.
  useEffect(() => {
    if (seeded.current || !line) return
    seeded.current = true
    clearPrompt()
    suggest(line)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (id: string) =>
    setActivities((list) => (list.includes(id) ? list.filter((a) => a !== id) : list.length >= MAX_ACTIVITIES ? list : [...list, id]))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!name.trim()) next.name = t('circles.create.errors.name')
    if (activities.length === 0) next.activities = t('circles.create.errors.activities')
    if (!character) next.character = t('circles.join.errors.character')
    setErrors(next)
    if (Object.keys(next).length > 0) return
    try {
      const circle = await create.mutateAsync({ name: name.trim(), activities, character: character!, locale })
      clearPrompt()
      navigate(`/app/circles/${circle.id}`, { viewTransition: true, state: { created: true } })
    } catch (err) {
      setErrors({ form: err instanceof ApiError && err.status === 429 ? t('circles.errors.slowDown') : t('common.errorGeneric') })
    }
  }

  const shownName = name.trim()

  return (
    <form className="page create" onSubmit={submit} noValidate>
      <PageHeader crumbs={[{ to: '/app', label: t('common.nav.home') }]} title={t('circles.create.title')} lead={t('circles.create.lead')} />

      <div className="create__grid">
        <div className="create__main">
          <section className="panel" aria-labelledby="start-title">
            <div className="panel__head">
              <h2 id="start-title" className="panel__title">{t('circles.create.mode')}</h2>
              <Segmented<Mode>
                label={t('circles.create.mode')}
                hideLabel
                value={mode}
                onChange={setMode}
                choices={[{ value: 'describe', label: t('circles.create.describe') }, { value: 'manual', label: t('circles.create.byHand') }]}
              />
            </div>
            {mode === 'describe' ? (
              <div className="panel__body create__describe">
                <label className="field" htmlFor={lineId}>
                  <span className="field__label">{t('circles.create.describeLabel')}</span>
                </label>
                <div className="create__line">
                  <textarea
                    id={lineId}
                    className="input create__line-field"
                    rows={2}
                    maxLength={PROMPT_MAX}
                    dir="auto"
                    placeholder={t('circles.create.describePlaceholder')}
                    value={line}
                    aria-describedby={lineHelp}
                    onChange={(e) => setLine(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        suggest(line)
                      }
                    }}
                  />
                  <Button type="button" variant="default" icon={<ListChecks size={16} aria-hidden="true" />} onClick={() => suggest(line)}>
                    {suggested ? t('circles.create.suggestAgain') : t('circles.create.suggest')}
                  </Button>
                </div>
                <p id={lineHelp} className="field__help">{t('circles.create.suggestHelp')}</p>
                <p className="visually-hidden" role="status" aria-live="polite">{applied}</p>
              </div>
            ) : null}
          </section>

          <section className="panel" aria-labelledby="basics-title">
            <div className="panel__head">
              <h2 id="basics-title" className="panel__title">{t('circles.create.basics')}</h2>
              {suggested && mode === 'describe' ? <span className="lozenge lozenge--ai">{t('circles.create.suggested')}</span> : null}
            </div>
            <div className="panel__body">
              <label className="field" htmlFor={nameId}>
                <span className="field__label">{t('circles.create.name')}</span>
              </label>
              <input
                id={nameId}
                className="input create__name"
                value={name}
                maxLength={NAME_MAX}
                dir="auto"
                autoComplete="off"
                placeholder={t('circles.create.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? nameErr : undefined}
              />
              {errors.name ? <p id={nameErr} className="field__error" role="alert">{errors.name}</p> : null}
              <CharacterPicker legend={t('circles.create.yourCharacter')} value={character} onChange={setCharacter} invalid={!!errors.character} />
            </div>
          </section>

          <section className="panel" data-perch="activities" aria-labelledby="acts-title" aria-describedby={errors.activities ? actErr : undefined}>
            <div className="panel__head">
              <h2 id="acts-title" className="panel__title">{t('circles.create.activities')}</h2>
              <span className="lozenge lozenge--info">{t('circles.create.picked', { count: activities.length, max: MAX_ACTIVITIES })}</span>
            </div>
            <div className="panel__body">
              <p className="field__help">{t('circles.create.activitiesHelp')}</p>
              <ActivityGrid mode="choose" selected={activities} onToggle={toggle} />
              {errors.activities ? <p id={actErr} className="field__error" role="alert">{errors.activities}</p> : null}
            </div>
          </section>
        </div>

        <aside className="create__side">
          <section className="panel panel--dark" aria-labelledby="preview-title">
            <div className="panel__head">
              <h2 id="preview-title" className="panel__title">{t('circles.create.preview')}</h2>
            </div>
            <div className="panel__body create__preview">
              <div className="create__preview-row">
                <span className="create__preview-label">{t('circles.create.name')}</span>
                <p className={`create__preview-name${shownName ? '' : ' is-empty'}`} dir="auto">
                  <bdi>{shownName || t('circles.create.namePlaceholder')}</bdi>
                </p>
              </div>
              <div className="create__preview-row">
                <span className="create__preview-label">{t('circles.create.seats')}</span>
                <div className="create__seats">
                  <span className="stack" aria-hidden="true">
                    {character ? <Character id={character} tag={false} /> : null}
                  </span>
                  <span className="create__seats-note">{t('circles.create.seatsNote')}</span>
                </div>
              </div>
              <div className="create__preview-row">
                <span className="create__preview-label">{t('circles.create.activities')}</span>
                {activities.length > 0 ? (
                  <ul className="create__acts">
                    {activities.map((id) => <li key={id} className="create__act">{t(`activities.${id}.title`)}</li>)}
                  </ul>
                ) : null}
                <p className="create__count">
                  <strong>{t('circles.create.picked', { count: activities.length, max: MAX_ACTIVITIES })}</strong>
                  <span>{t('circles.create.pickedOf')}</span>
                </p>
                <Meter value={activities.length} max={MAX_ACTIVITIES} tone="ok" label={t('circles.create.activities')} />
              </div>
            </div>
            <div className="panel__actions">
              {errors.form ? <p className="field__error" role="alert">{errors.form}</p> : null}
              <Button type="submit" size="lg" busy={create.isPending} icon={<ArrowRight className="flip-rtl" size={18} />}>
                {t('circles.create.submit')}
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </form>
  )
}
