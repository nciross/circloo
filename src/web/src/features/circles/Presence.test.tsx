import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../i18n'
import { Presence } from './Canvas'
import type { Member } from '../../api/circles'

const member = (id: string, name: string, role: Member['role'], character: Member['character']): Member => ({ id, name, role, character, ring: 0 })
const members = [
  member('p1', 'Théo', 'participant', 'fox'),
  member('a1', 'Amina', 'animator', 'panda'),
  member('p2', 'Lucía', 'participant', 'octopus'),
]

describe('Presence', () => {
  it('lists the animator first, then who is here, then who is away, with the count', () => {
    render(<Presence members={members} online={['p1']} cursors={{}} meId="a1" now={0} onJump={() => undefined} />)
    const labels = screen.getAllByRole('img').map((el) => el.getAttribute('aria-label') ?? '')
    expect(labels[0]).toMatch(/^Amina/)
    expect(labels[1]).toMatch(/^Théo/)
    expect(labels[2]).toMatch(/^Lucía/)
    expect(screen.getByText('2 of 3 here')).toBeInTheDocument()
  })

  it('lets you jump to someone whose pointer is on the canvas, never to yourself', async () => {
    const onJump = vi.fn()
    render(<Presence members={members} online={['p1']} cursors={{ p1: { x: 10, y: 20, at: 0 }, a1: { x: 0, y: 0, at: 0 } }} meId="a1" now={0} onJump={onJump} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /Théo/ }))
    expect(onJump).toHaveBeenCalledWith('p1')
  })
})
