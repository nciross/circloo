import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { ApiError } from '../../api/client'
import { useCreateCircle } from '../../api/circles'
import { useDocumentTitle } from '../../app/locale'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import type { AnyCharacter } from '../../components/characters'
import { useUiStore } from '../../stores/ui'
import { ActivityGrid, CharacterPicker } from './parts'
import { MAX_ACTIVITIES } from './catalog'
import '../../styles/circles.css'

const NAME_MAX = 60

/** Animator: name the circle, pick your character and the activities, get a link. */
export default function CreateCircle() {
  const { t } = useTranslation()
  useDocumentTitle('circles.create.title')
  const navigate = useNavigate()
  const locale = useUiStore((s) => s.locale)
  const create = useCreateCircle()
  const [name, setName] = useState('')
  const [character, setCharacter] = useState<AnyCharacter | null>('panda')
  const [activities, setActivities] = useState<string[]>(['quick-question'])
  const [errors, setErrors] = useState<{ name?: string; activities?: string; character?: string; form?: string }>({})
  const nameId = useId()
  const nameErr = useId()
  const actErr = useId()

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
      navigate(`/app/circles/${circle.id}`, { viewTransition: true, state: { created: true } })
    } catch (err) {
      setErrors({ form: err instanceof ApiError && err.status === 429 ? t('circles.errors.slowDown') : t('common.errorGeneric') })
    }
  }

  return (
    <form className="page create" onSubmit={submit} noValidate>
      <PageHeader crumbs={[{ to: '/app', label: t('common.nav.home') }]} title={t('circles.create.title')} lead={t('circles.create.lead')} />

      <section className="panel" aria-labelledby="basics-title">
        <div className="panel__head">
          <h2 id="basics-title" className="panel__title">{t('circles.create.basics')}</h2>
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
        <div className="panel__actions">
          {errors.form ? <p className="field__error" role="alert">{errors.form}</p> : null}
          <Button type="submit" size="lg" busy={create.isPending} icon={<ArrowRight className="flip-rtl" size={18} />}>
            {t('circles.create.submit')}
          </Button>
        </div>
      </section>
    </form>
  )
}
