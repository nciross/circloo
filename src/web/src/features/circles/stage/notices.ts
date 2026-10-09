import type { TFunction } from 'i18next'
import type { CallNotice } from './stage'

/**
 * The sentence a person reads for a `CallNotice` (contracts/hub.md), or null when there is nothing to tell them: the
 * animator already sees what they did themselves. A call that ended with nobody named ended because the animator was
 * away too long (or the circle closed), which says so instead of blaming anyone.
 */
export function noticeText(t: TFunction, notice: CallNotice, meId: string | null | undefined): string | null {
  if (notice.byMemberId && meId && notice.byMemberId === meId) return null
  if (notice.kind === 'call-ended' && !notice.byMemberId) return t('circles.call.notices.call-ended-away')
  return t(`circles.call.notices.${notice.kind}`)
}
