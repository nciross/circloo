import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Hand, MessageCircle, Phone, Users } from 'lucide-react'
import type { Member } from '../../../api/circles'
import { ChatPanel } from './ChatPanel'
import { InviteCard } from '../parts'
import { PRESENTATION } from '../catalog'
import { useRoom } from '../room'
import { PeopleList } from './PeopleList'
import { HandsQueue } from './HandsQueue'
import { HandsAnnouncer } from './HandsAnnouncer'
import { CallPanel } from '../stage/CallPanel'
import { useStage } from '../stage/stage'
import { RoomSidebar, type SideTab } from './RoomSidebar'
import { activeTab, type SideState } from './useSide'
import { unreadCount } from './sidebar'

/**
 * The room's side area: People, Chat when the current activity is not itself a chat, Hands (the raised hands queue,
 * spec 008 US5) and Call (the switch, Join call and the people in the call, with their number on the tab while a call
 * is on). The Hands tab and the phone's closed pill count the hands waiting; the hands announcer stays mounted whatever
 * tab is open.
 * The side state lives in the room, so the work bar can open a tab too.
 */
export function RoomPanels({ side, isAnimator, members, online, meId, arrivals, announcement, chatActivity, invite }: {
  side: SideState
  isAnimator: boolean
  members: Member[]
  online: string[]
  meId: string
  arrivals: string[]
  announcement: string
  /** The activity whose conversation goes in the sidebar; null when the main area already is the chat, or nothing runs. */
  chatActivity: string | null
  invite?: { code: string; fresh: boolean }
}) {
  const { t } = useTranslation()
  const messages = useRoom((s) => s.messages)
  const callOn = useStage((s) => s.discussion?.on ?? false)
  const inCall = useStage((s) => s.roster.length)
  const hands = useRoom((s) => s.hands)
  const waiting = hands.queue.length
  const mine = messages.filter((m) => m.activityId === chatActivity)
  const [seenRaw, setSeen] = useState({ of: chatActivity, n: 0 })
  // What was read belongs to one activity's conversation; another activity starts with nothing unread.
  const seen = seenRaw.of === chatActivity ? seenRaw.n : 0
  const tabs: SideTab[] = [
    {
      id: 'people',
      label: t('circles.room.peopleTab'),
      icon: <Users size={15} />,
      badge: members.length,
      badgeLabel: t('circles.people', { count: members.length }),
      panel: (
        <>
          <PeopleList members={members} online={online} meId={meId} arrivals={arrivals} hands={hands} />
          {invite ? <InviteCard code={invite.code} fresh={invite.fresh} /> : null}
        </>
      ),
    },
  ]
  const unread = unreadCount(mine, seen, meId)
  if (chatActivity) {
    tabs.push({
      id: 'chat',
      label: t('circles.room.chatTab'),
      icon: <MessageCircle size={15} />,
      badge: unread,
      badgeLabel: t('circles.room.unread', { count: unread }),
      panel: <ChatPanel activityId={chatActivity} hideEnd={chatActivity === PRESENTATION} />,
    })
  }
  tabs.push({
    id: 'hands',
    label: t('circles.hands.tab'),
    icon: <Hand size={15} />,
    badge: waiting,
    badgeLabel: t('circles.room.hands', { count: waiting }),
    panel: <HandsQueue />,
  })
  tabs.push({
    id: 'call',
    label: t('circles.room.callTab'),
    icon: <Phone size={15} />,
    badge: callOn ? inCall : 0,
    badgeLabel: t('circles.call.inCall', { count: inCall }),
    panel: <CallPanel isAnimator={isAnimator} members={members} />,
  })
  const chatShown = !!chatActivity && side.open && activeTab(tabs, side.tab) === 'chat'
  if (chatShown && (seenRaw.of !== chatActivity || seenRaw.n !== mine.length)) setSeen({ of: chatActivity, n: mine.length })

  return (
    <RoomSidebar
      tabs={tabs}
      side={side}
      unread={chatShown ? 0 : unread}
      hands={waiting}
      announce={announcement ? t('circles.room.joined', { name: announcement }) : ''}
      live={<HandsAnnouncer />}
    />
  )
}
