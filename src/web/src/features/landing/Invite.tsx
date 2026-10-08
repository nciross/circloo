import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Hash, Link2 } from 'lucide-react'
import { Band, BandHead } from './Band'

/** The sample invite: a made-up circle, labelled as an example on the window. */
const SAMPLE = { link: 'circloo.app/c/7F3K-2QW9', code: '7F3K2Q' } as const
type Way = keyof typeof SAMPLE

/**
 * The invite band (#250): one line is all it takes to bring someone in. A segmented control picks the way (a link
 * or a short code) and a dark window shows what gets sent, with a button that copies the sample line.
 */
export function Invite() {
  const { t } = useTranslation()
  const id = useId()
  const [way, setWay] = useState<Way>('link')
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  const tabs = useRef<Record<Way, HTMLButtonElement | null>>({ link: null, code: null })

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    const line = SAMPLE[way]
    try {
      await navigator.clipboard.writeText(line)
    } catch {
      /* the clipboard is blocked here: the line is still on screen to select */
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const next: Way = e.key === 'Home' ? 'link' : e.key === 'End' ? 'code' : way === 'link' ? 'code' : 'link'
    setWay(next)
    tabs.current[next]?.focus()
  }

  const ways: { id: Way; icon: typeof Link2 }[] = [{ id: 'link', icon: Link2 }, { id: 'code', icon: Hash }]
  return (
    <Band id="invite" tone="dark" className="inv" labelledBy="invite-title">
      <BandHead id="invite-title" eyebrow={t('landing.invite.eyebrow')} title={t('landing.invite.title')} lead={t('landing.invite.lead')} align="split" />
      <div className="inv__demo">
        <div className="seg" role="tablist" aria-label={t('landing.invite.ways')}>
          {ways.map(({ id: w, icon: Icon }) => (
            <button
              key={w}
              ref={(el) => { tabs.current[w] = el }}
              type="button"
              role="tab"
              id={`${id}-tab-${w}`}
              className="seg__tab"
              aria-selected={way === w}
              aria-controls={`${id}-panel`}
              tabIndex={way === w ? 0 : -1}
              onClick={() => setWay(w)}
              onKeyDown={onKey}
            >
              <Icon size={16} strokeWidth={2.5} aria-hidden="true" /> {t(`landing.invite.${w}`)}
            </button>
          ))}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${way}`} className="win">
          <div className="win__bar">
            <span className="win__dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="win__tab" aria-hidden="true">{t('landing.invite.windowTab')}</span>
            <span className="lozenge win__example">{t('landing.invite.example')}</span>
          </div>
          <div className="win__body">
            <p className="win__hint">{t(`landing.invite.${way}Hint`)}</p>
            <p className={`win__value win__value--${way}`} dir="ltr">
              <bdi>{SAMPLE[way]}</bdi>
            </p>
            <button type="button" className="btn btn--primary win__copy" onClick={copy} aria-live="polite">
              {copied ? <Check size={18} strokeWidth={2.5} aria-hidden="true" /> : <Copy size={18} strokeWidth={2.25} aria-hidden="true" />}
              {t(copied ? 'landing.invite.copied' : 'landing.invite.copy')}
            </button>
          </div>
        </div>
      </div>
    </Band>
  )
}
