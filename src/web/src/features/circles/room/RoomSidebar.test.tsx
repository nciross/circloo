import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import type { Member } from '../../../api/circles'
import { PeopleList } from './PeopleList'
import { RoomSidebar } from './RoomSidebar'
import { useSideState } from './useSide'

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

function Harness() {
  const side = useSideState()
  return <RoomSidebar side={side} unread={2} tabs={[{ id: 'people', label: 'People', icon: null, panel: <p>list</p> }, { id: 'chat', label: 'Chat', icon: null, panel: <p>talk</p> }]} />
}

describe('RoomSidebar', () => {
  it('switches tabs with the arrow keys and collapses to a handle that keeps the unread count', async () => {
    window.localStorage.clear()
    render(<Harness />)
    const people = screen.getByRole('tab', { name: 'People' })
    people.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('talk')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse the sidebar' }))
    const handle = screen.getByRole('button', { name: /People and chat/ })
    expect(handle).toHaveFocus()
    expect(handle).toHaveTextContent('2 unread messages')
    expect(window.localStorage.getItem('circloo.room.side')).toBe('closed')
  })
})
