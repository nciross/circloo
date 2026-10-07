import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { Member } from '../../../api/circles'
import { PeopleList } from './PeopleList'
import { RoomSidebar } from './RoomSidebar'
import { useSideState } from './useSide'
import { Count } from './Count'

const people = (n: number): Member[] => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `Person ${String(i).padStart(3, '0')}`, role: i === 0 ? 'animator' : 'participant', character: 'fox', ring: i % 6 }))

describe('PeopleList', () => {
  it('says who is here and away, marks the animator with a label, and finds a name', async () => {
    render(<PeopleList members={[{ id: 'a', name: 'Amina', role: 'animator', character: 'panda', ring: 0 }, { id: 'b', name: 'Théo', role: 'participant', character: 'fox', ring: 1 }]} online={['a']} meId="a" />)
    expect(screen.getByText('1 here · 1 away')).toBeInTheDocument()
    expect(screen.getByText('Animator')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox'), 'theo')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByText('Amina')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('1 person found')
  })

  it('draws a window of 100 people, each row keeping its place in the list', () => {
    render(<PeopleList members={people(100)} online={people(100).map((p) => p.id)} meId="m1" />)
    const rows = screen.getAllByRole('listitem').filter((li) => li.hasAttribute('aria-posinset'))
    expect(rows.length).toBeLessThan(40)
    expect(rows[0]).toHaveAttribute('aria-setsize', '100')
    expect(rows[0]).toHaveAttribute('aria-posinset', '1')
  })
})


function Harness({ unread = 2 }: { unread?: number }) {
  const side = useSideState()
  return (
    <RoomSidebar
      side={side}
      unread={unread}
      tabs={[
        { id: 'people', label: 'People', icon: null, badge: 14, badgeLabel: '14 people', panel: <p>list</p> },
        { id: 'chat', label: 'Chat', icon: null, badge: unread, badgeLabel: `${unread} unread messages`, panel: <p>talk</p> },
        { id: 'call', label: 'Call', icon: null, panel: <p>stage</p> },
      ]}
    />
  )
}

describe('RoomSidebar', () => {
  beforeEach(() => window.localStorage.clear())

  it('switches tabs with the arrow keys and collapses to an icon rail that takes the focus and keeps the counts', async () => {
    render(<Harness />)
    const people = screen.getByRole('tab', { name: /People/ })
    people.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Chat/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('talk')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse the sidebar' }))
    expect(screen.getByRole('button', { name: 'Open the sidebar' })).toHaveFocus()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByRole('button', { name: 'Chat, 2 unread messages' })).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: 'People, 14 people' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Call' })).toBeInTheDocument()
    expect(window.localStorage.getItem('circloo.room.side')).toBe('closed')
  })

  it('opens on the tab pressed in the rail and moves the focus to it', async () => {
    window.localStorage.setItem('circloo.room.side', 'closed')
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Call' }))
    const call = screen.getByRole('tab', { name: /Call/ })
    expect(call).toHaveAttribute('aria-selected', 'true')
    expect(call).toHaveFocus()
    expect(screen.getByText('stage')).toBeVisible()
    expect(window.localStorage.getItem('circloo.room.side')).toBe('open')
  })

  it('shows "99+" past 99 and reads the exact count', () => {
    window.localStorage.setItem('circloo.room.side', 'closed')
    render(<Harness unread={140} />)
    expect(screen.getByRole('button', { name: 'Chat, 140 unread messages' })).toHaveTextContent('99+')
  })
})

describe('Count', () => {
  it('pops once when the number goes up, not on first show or when it goes down', () => {
    const { container, rerender } = render(<Count value={1} className="n" />)
    const el = () => container.querySelector('.n')!
    expect(el()).not.toHaveClass('is-pop')
    rerender(<Count value={2} className="n" />)
    expect(el()).toHaveClass('is-pop')
    // jsdom has no AnimationEvent, so React listens for the prefixed name there; a browser sends animationend.
    fireEvent.animationEnd(el())
    fireEvent(el(), new Event('webkitAnimationEnd', { bubbles: true }))
    expect(el()).not.toHaveClass('is-pop')
    rerender(<Count value={1} className="n" />)
    expect(el()).not.toHaveClass('is-pop')
    expect(el()).toHaveTextContent('1')
  })
})
