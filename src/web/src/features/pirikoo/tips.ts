import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { useMe } from '../../api/hooks'
import { useMyCircles, joinLink } from '../../api/circles'
import { useIntegrations } from '../../api/integrations'
import { useRoom } from '../circles/room'
import { ACTIVITIES, BOARD_COLUMNS, CANVAS, VOTES_PER_MEMBER } from '../circles/catalog'

export interface Tip {
  /** Stable id: once dismissed or done, the same tip does not come back in this session. */
  id: string
  text: string
  action?: { label: string; run: () => void | Promise<unknown> }
  /** `data-perch` of the element Pirikoo lands on; the screen corner when absent or off screen. */
  perch?: string
}

/**
 * What Pirikoo suggests right now, from the page, the person's role and the live room. Plain rules, no AI:
 * one useful next step at a time, worded for an animator or for a participant.
 */
export function useTip(): Tip | null {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data: me } = useMe()
  const signedIn = !!me
  const circles = useMyCircles(signedIn && pathname === '/app')
  const integrations = useIntegrations(signedIn && pathname === '/app/integrations')
  const room = useRoom()

  const inRoom = /^\/(app\/circles|c)\/[0-9a-f-]{36}$/.test(pathname) && room.circleId !== null && !room.closed
  if (inRoom && room.me) {
    const id = (s: string) => `${room.circleId}:${s}`
    const activity = room.activity
    const isBoard = !!activity && !!BOARD_COLUMNS[activity]
    const mine = room.notes.filter((n) => n.activityId === activity)
    const onCanvas = activity === CANVAS ? room.canvas.filter((n) => n.activityId === CANVAS) : []

    if (room.me.role === 'animator') {
      if (room.online.length < 2 && room.joinCode) {
        return {
          id: id('share'),
          text: t('pirikoo.tips.share'),
          perch: 'invite',
          action: { label: t('pirikoo.actions.copy'), run: () => navigator.clipboard.writeText(joinLink(room.joinCode!)) },
        }
      }
      if (!activity) {
        const warmUp = ACTIVITIES.find((a) => a.category === 'icebreakers' && room.activities.includes(a.id))?.id ?? room.activities[0]
        return warmUp
          ? {
              id: id('warm-up'),
              text: t('pirikoo.tips.warmUp', { activity: t(`activities.${warmUp}.title`) }),
              perch: 'pick',
              action: { label: t('pirikoo.actions.start'), run: () => room.start(warmUp) },
            }
          : null
      }
      if (activity === CANVAS && onCanvas.length >= 4) {
        return {
          id: id(`sum-canvas-${Math.floor(onCanvas.length / 8)}`),
          text: t('pirikoo.tips.sumCanvas'),
          perch: 'canvas',
          action: { label: t('pirikoo.actions.sumUp'), run: () => room.ask(t('circles.room.quick.2')) },
        }
      }
      if (activity === CANVAS) return null
      if (isBoard && mine.length >= 3) {
        return {
          id: id(`sum-board-${activity}`),
          text: t('pirikoo.tips.sumBoard'),
          perch: 'board',
          action: { label: t('pirikoo.actions.sumUp'), run: () => room.ask(t('circles.room.quick.2')) },
        }
      }
      const answers = room.messages.filter((m) => m.activityId === activity && m.kind === 'member' && m.memberId !== room.me!.id).length
      if (!isBoard && answers >= 3) {
        return {
          id: id(`next-${activity}-${Math.floor(answers / 3)}`),
          text: t('pirikoo.tips.next'),
          perch: 'composer',
          action: { label: t('pirikoo.actions.next'), run: () => room.ask(t('circles.room.quick.0')) },
        }
      }
      return null
    }

    // Participant
    if (!activity) return { id: id('wait'), text: t('pirikoo.tips.wait') }
    if (activity === CANVAS) {
      return onCanvas.some((n) => n.authorId === room.me!.id) ? null : { id: id('canvas-first'), text: t('pirikoo.tips.canvasFirst'), perch: 'canvas' }
    }
    if (isBoard) {
      if (!mine.some((n) => n.authorId === room.me!.id)) return { id: id(`first-note-${activity}`), text: t('pirikoo.tips.firstNote'), perch: 'board' }
      const used = mine.filter((n) => n.voters.includes(room.me!.id)).length
      if (mine.length >= 3 && used < VOTES_PER_MEMBER) {
        return { id: id(`dots-${activity}`), text: t('pirikoo.tips.dots', { count: VOTES_PER_MEMBER - used }), perch: 'board' }
      }
      return null
    }
    const said = room.messages.some((m) => m.activityId === activity && m.memberId === room.me!.id)
    return said ? null : { id: id(`answer-${activity}`), text: t('pirikoo.tips.answer'), perch: 'composer' }
  }

  if (!signedIn) return null
  if (pathname === '/app' && circles.data) {
    const open = circles.data.find((c) => c.status === 'open')
    return circles.data.length === 0
      ? { id: 'home:first', text: t('pirikoo.tips.firstCircle'), perch: 'circles', action: { label: t('circles.new'), run: () => navigate('/app/circles/new') } }
      : open
        ? { id: `home:back:${open.id}`, text: t('pirikoo.tips.backTo', { name: open.name }), perch: 'circles', action: { label: t('pirikoo.actions.open'), run: () => navigate(`/app/circles/${open.id}`) } }
        : null
  }
  if (pathname === '/app/circles/new') return { id: 'create:mix', text: t('pirikoo.tips.mix'), perch: 'activities' }
  if (pathname === '/app/integrations' && integrations.data && !integrations.data.some((i) => i.connected)) {
    return { id: 'integrations:first', text: t('pirikoo.tips.connect'), perch: 'services' }
  }
  if (pathname === '/app/icebreakers') return { id: 'ice:keys', text: t('pirikoo.tips.keys'), perch: 'line' }
  return null
}
