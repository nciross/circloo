import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowRight, Mail } from 'lucide-react'
import { ApiError } from '../../api/client'
import { useMe, useRequestCode, useVerifyCode } from '../../api/hooks'
import { safeReturnTo } from '../../lib/returnTo'
import { normalizeCode } from '../../lib/forms'
import { useDocumentTitle } from '../../app/locale'
import { Button } from '../../components/Button'
import { AuthLayout } from '../../components/AuthLayout'
import { useSignInStore } from '../../stores/signIn'
import { useUiStore } from '../../stores/ui'
import '../../styles/app.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function useSecondsUntil(at: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (at <= now) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [at, now])
  return Math.max(0, Math.ceil((at - now) / 1000))
}

function EmailStep() {
  const { t } = useTranslation()
  const locale = useUiStore((s) => s.locale)
  const { email: savedEmail, codeSent } = useSignInStore()
  const request = useRequestCode()
  const [email, setEmail] = useState(savedEmail)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setError(t('auth.errors.invalidEmail'))
      return
    }
    setError(null)
    try {
      const res = await request.mutateAsync({ email: value, locale })
      codeSent(value, res.resendAfterSeconds)
    } catch (err) {
      if (err instanceof ApiError && err.type === 'invalid-email') setError(t('auth.errors.invalidEmail'))
      else if (err instanceof ApiError && err.status === 429)
        setError(t('auth.errors.rateLimited', { minutes: Math.max(1, Math.ceil((err.retryAfterSeconds ?? 60) / 60)) }))
      else setError(t('auth.errors.generic'))
    }
  }

  return (
    <form className="authform" onSubmit={submit} noValidate>
      <h1 className="authform__title">{t('auth.title')}</h1>
      <p className="authform__lead">{t('auth.lead')}</p>
      <label className="field">
        <span className="field__label">{t('auth.emailLabel')}</span>
        <input
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('auth.emailPlaceholder')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      {error ? <p id={errorId} className="field__error" role="alert">{error}</p> : null}
      <Button type="submit" size="lg" busy={request.isPending} icon={<Mail size={20} strokeWidth={2.5} />}>
        {request.isPending ? t('auth.sending') : t('auth.send')}
      </Button>
    </form>
  )
}

function CodeStep() {
  const { t } = useTranslation()
  const locale = useUiStore((s) => s.locale)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { email, resendAvailableAt, codeSent, editEmail, reset } = useSignInStore()
  const verify = useVerifyCode()
  const request = useRequestCode()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(t('auth.neutral'))
  const seconds = useSecondsUntil(resendAvailableAt)
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()

  useEffect(() => inputRef.current?.focus(), [])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (code.length !== 6) {
      setError(t('auth.errors.incompleteCode'))
      return
    }
    setError(null)
    try {
      const res = await verify.mutateAsync({ email, code })
      reset()
      const returnTo = safeReturnTo(params.get('returnTo'))
      const target = res.me.profileCompleted ? returnTo : `/app/welcome?returnTo=${encodeURIComponent(returnTo)}`
      navigate(target, { replace: true })
    } catch (err) {
      setCode('')
      if (err instanceof ApiError && err.status === 400) setError(t('auth.errors.invalidCode'))
      else if (err instanceof ApiError && err.status === 429)
        setError(t('auth.errors.rateLimited', { minutes: Math.max(1, Math.ceil((err.retryAfterSeconds ?? 60) / 60)) }))
      else setError(t('auth.errors.generic'))
      inputRef.current?.focus()
    }
  }

  const resend = async () => {
    setError(null)
    try {
      const res = await request.mutateAsync({ email, locale })
      codeSent(email, res.resendAfterSeconds)
      setNotice(t('auth.neutral'))
      setCode('')
      inputRef.current?.focus()
    } catch (err) {
      if (err instanceof ApiError && err.status === 429)
        setError(t('auth.errors.rateLimited', { minutes: Math.max(1, Math.ceil((err.retryAfterSeconds ?? 60) / 60)) }))
      else setError(t('auth.errors.generic'))
    }
  }

  const digits = Array.from({ length: 6 }, (_, i) => code[i] ?? '')

  return (
    <form className="authform" onSubmit={submit} noValidate>
      <h1 className="authform__title">{t('auth.codeTitle')}</h1>
      <p className="authform__lead">
        <Trans i18nKey="auth.codeLead" values={{ email }} components={{ email: <bdi dir="ltr" className="authform__email" /> }} />
      </p>
      {notice && !error ? <p className="authform__notice" role="status">{notice}</p> : null}
      <label className="code-field">
        <span className="field__label">{t('auth.codeLabel')}</span>
        <span className="code-field__tiles" dir="ltr">
          <input
            ref={inputRef}
            className="code-field__input"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={9}
            value={code}
            onChange={(e) => {
              const next = normalizeCode(e.target.value)
              setCode(next)
              if (next.length === 6) setError(null)
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          {digits.map((d, i) => (
            <span key={i} className={`code-tile${d ? ' is-filled' : ''}${i === code.length ? ' is-next' : ''}${code.length === 6 && i === 5 ? ' is-last' : ''}`} aria-hidden="true">
              {d}
            </span>
          ))}
        </span>
      </label>
      {error ? <p id={errorId} className="field__error" role="alert">{error}</p> : null}
      <Button type="submit" size="lg" busy={verify.isPending} icon={<ArrowRight className="flip-rtl" size={20} strokeWidth={2.5} />}>
        {verify.isPending ? t('auth.verifying') : t('auth.verify')}
      </Button>
      <div className="authform__links">
        <button type="button" className="link-btn" onClick={resend} disabled={seconds > 0 || request.isPending}>
          {seconds > 0 ? t('auth.resendIn', { seconds }) : t('auth.resend')}
        </button>
        <button type="button" className="link-btn" onClick={editEmail}>{t('auth.changeEmail')}</button>
      </div>
    </form>
  )
}

export default function SignIn() {
  const step = useSignInStore((s) => s.step)
  const { data: me } = useMe()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  useDocumentTitle('auth.title')

  useEffect(() => {
    if (!me) return
    const returnTo = safeReturnTo(params.get('returnTo'))
    navigate(me.profileCompleted ? returnTo : `/app/welcome?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
  }, [me, navigate, params])

  return (
    <AuthLayout>{step === 'code' ? <CodeStep /> : <EmailStep />}</AuthLayout>
  )
}
