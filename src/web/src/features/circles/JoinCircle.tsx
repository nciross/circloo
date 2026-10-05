import { useId, useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { ApiError } from '../../api/client'
import { useMe } from '../../api/hooks'
import { useJoin, useJoinInfo } from '../../api/circles'
import { useDocumentTitle } from '../../app/locale'
import { AuthLayout } from '../../components/AuthLayout'
import { Button, ButtonLink } from '../../components/Button'
import { Character } from '../../components/Character'
import { Loading } from '../../components/Loading'
import type { AnyCharacter } from '../../components/characters'
import { CharacterPicker, RingPicker } from './parts'
import '../../styles/app.css'
import '../../styles/circles.css'

const NAME_MAX = 24

/** Public: anyone with the link picks a private name and a character, then enters the circle. */
export default function JoinCircle() {
  const { t } = useTranslation()
  useDocumentTitle('circles.join.title')
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { data: me } = useMe()
  const info = useJoinInfo(code)
  const join = useJoin(code)
  const [name, setName] = useState<string | null>(null)
  const [character, setCharacter] = useState<AnyCharacter | null>(null)
  // The ring picked among the free ones of that character; null means "the lowest free one".
  const [ring, setRing] = useState<number | null>(null)
  const [errors, setErrors] = useState<{ name?: string; character?: string; form?: string }>({})

  const nameId = useId()
  const nameErr = useId()
  const charErr = useId()
  const value = name ?? me?.displayName ?? ''

  if (info.isPending) return <Loading />
  if (info.isError || !info.data) {
    return (
      <AuthLayout note={false}>
        <div className="authform">
          <h1 className="authform__title">{t('circles.join.closedTitle')}</h1>
          <p className="authform__lead">{t('circles.join.closedBody')}</p>
          <ButtonLink to="/">{t('notFound.home')}</ButtonLink>
        </div>
      </AuthLayout>
    )
  }

  const circle = info.data
  const goIn = () => navigate(me ? `/app/circles/${circle.circleId}` : `/c/${circle.circleId}`, { replace: true, viewTransition: true })
  if (circle.alreadyIn) {
    return (
      <AuthLayout note={false}>
        <div className="authform">
          <h1 className="authform__title"><bdi>{circle.name}</bdi></h1>
          <p className="authform__lead">{t('circles.join.alreadyIn')}</p>
          <Button size="lg" onClick={goIn} icon={<ArrowRight className="flip-rtl" size={18} />}>{t('circles.join.enter')}</Button>
        </div>
      </AuthLayout>
    )
  }

  const use = character ? circle.characters?.find((u) => u.id === character) : undefined
  const freeRings = use?.freeRings ?? [0]
  const chosenRing = ring !== null && freeRings.includes(ring) ? ring : (freeRings[0] ?? 0)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!value.trim()) next.name = t('circles.join.errors.name')
    if (!character) next.character = t('circles.join.errors.character')
    setErrors(next)
    if (Object.keys(next).length > 0) return
    try {
      // The server may give another free ring if someone took this one a moment ago; the room shows the one given.
      await join.mutateAsync({ name: value.trim(), character: character!, ...(chosenRing > 0 ? { ring: chosenRing } : {}) })
      goIn()
    } catch (err) {
      // Every copy of that character is taken now (spec 008): show what is free.
      if (err instanceof ApiError && err.type === 'character-full') {
        await info.refetch()
        setCharacter(null)
        setRing(null)
        setErrors({ character: t('circles.join.errors.taken') })
      } else if (err instanceof ApiError && err.type === 'circle-full') {
        await info.refetch()
        setErrors({ form: t('circles.join.errors.full') })
      }
      else if (err instanceof ApiError && err.status === 404) setErrors({ form: t('circles.join.closedBody') })
      else if (err instanceof ApiError && err.status === 429) setErrors({ form: t('circles.errors.slowDown') })
      else setErrors({ form: t('common.errorGeneric') })
    }
  }

  return (
    <AuthLayout note={false}>
      <form className="authform join" onSubmit={submit} noValidate>
        <div className="join__host">
          <Character id={circle.animatorCharacter} className="join__host-char" />
          <p className="authform__lead">
            <Trans i18nKey="circles.join.invitedBy" values={{ name: circle.animatorName }} components={{ b: <bdi className="join__host-name" /> }} />
          </p>
        </div>
        <h1 className="authform__title"><bdi>{circle.name}</bdi></h1>
        {circle.full ? <p className="authform__notice">{t('circles.join.errors.full')}</p> : null}

        <label className="field" htmlFor={nameId}>
          <span className="field__label">{t('circles.join.name')}</span>
        </label>
        <input
          id={nameId}
          className="input"
          name="name"
          value={value}
          maxLength={NAME_MAX}
          dir="auto"
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={`${nameId}-help${errors.name ? ` ${nameErr}` : ''}`}
        />
        <p id={`${nameId}-help`} className="field__help join__help">{t('circles.join.nameHelp')}</p>
        {errors.name ? <p id={nameErr} className="field__error" role="alert">{errors.name}</p> : null}

        <CharacterPicker
          legend={t('circles.join.character')}
          value={character}
          onChange={(c) => { setCharacter(c); setRing(null); setErrors((x) => ({ ...x, character: undefined })) }}
          taken={circle.taken}
          uses={circle.characters}
          pickedRing={chosenRing}
          describedBy={errors.character ? charErr : undefined}
          invalid={!!errors.character}
        />
        {errors.character ? <p id={charErr} className="field__error" role="alert">{errors.character}</p> : null}
        {character && use && use.used > 0 && freeRings.length > 0 ? (
          <RingPicker character={character} freeRings={freeRings} value={chosenRing} onChange={setRing} />
        ) : null}
        {errors.form ? <p className="field__error" role="alert">{errors.form}</p> : null}

        <Button type="submit" size="lg" busy={join.isPending} aria-disabled={circle.full || undefined} icon={<ArrowRight className="flip-rtl" size={18} />}>
          {t('circles.join.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
