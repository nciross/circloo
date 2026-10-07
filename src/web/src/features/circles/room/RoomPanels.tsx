import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle, Phone, Users } from 'lucide-react'
import type { Member } from '../../../api/circles'
import { Chat } from '../Chat'
import { InviteCard } from '../parts'
import { PRESENTATION } from '../catalog'
import { useRoom } from '../room'
import { PeopleList } from './PeopleList'
import { CallPanel } from '../stage/CallPanel'
import { RoomSidebar, type SideTab } from './RoomSidebar'
import { activeTab, type SideState } from './useSide'
import { unreadCount } from './sidebar'

/**
 * The room's side area with what exists today: People, Chat when the current activity is not itself a chat, and Call
 * (the Live discussion switch and the stage to come). The hands queue (#184) joins as another tab with its count passed as `hands`.
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
          <PeopleList members={members} online={online} meId={meId} arrivals={arrivals} />
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
      panel: <Chat activityId={chatActivity} hideEnd={chatActivity === PRESENTATION} />,
    })
  }
  tabs.push({
    id: 'call',
    label: t('circles.room.callTab'),
    icon: <Phone size={15} />,
    panel: <CallPanel isAnimator={isAnimator} />,
  })
  const chatShown = !!chatActivity && side.open && activeTab(tabs, side.tab) === 'chat'
  if (chatShown && (seenRaw.of !== chatActivity || seenRaw.n !== mine.length)) setSeen({ of: chatActivity, n: mine.length })

  return <RoomSidebar tabs={tabs} side={side} unread={chatShown ? 0 : unread} announce={announcement ? t('circles.room.joined', { name: announcement }) : ''} />
}
