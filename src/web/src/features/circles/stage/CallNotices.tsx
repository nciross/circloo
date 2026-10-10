import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { noticeText } from './notices'
import { useStage } from './stage'

function clearUpTo(id: number, dismiss: (id: number) => void) {
  for (const n of useStage.getState().notices) if (n.id <= id) dismiss(n.id)
}

/** How long a notice stays before it goes by itself; Dismiss takes it away sooner. */
export const NOTICE_MS = 15_000

/**
 * What happened in the call, told to the person in kind words (spec 009 US1 #5, US3 #3 and #6, US7 #2): the newest
 * notice on one line at the bottom of the centre, above the call's bar, whatever the centre shows. Screen readers hear
 * it from the room's announcer (`announce.ts`), grouped with the hands, so this line has no live region of its own.
 */
export function CallNotices({ meId }: { meId: string | null | undefined }) {
  const { t } = useTranslation()
  const notices = useStage((s) => s.notices)
  const dismiss = useStage((s) => s.dismissNotice)
  let current: { id: number; text: string } | null = null
  for (let i = notices.length - 1; i >= 0 && !current; i--) {
    const text = noticeText(t, notices[i]!, meId)
    if (text) current = { id: notices[i]!.id, text }
  }
  const id = current?.id

  useEffect(() => {
    if (id === undefined) return
    // A notice that goes takes the older ones with it: they are history, never shown again.
    const timer = window.setTimeout(() => clearUpTo(id, dismiss), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [id, dismiss])

  return (
    <div className={`call-notice${current ? '' : ' is-empty'}`}>
      <p className="call-notice__text">{current?.text}</p>
      {current ? (
        <button
          type="button"
          className="icon-btn call-notice__close"
          aria-label={t('circles.call.dismissNotice')}
          title={t('circles.call.dismissNotice')}
          onClick={() => clearUpTo(current.id, dismiss)}
        >
          <X size={18} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
