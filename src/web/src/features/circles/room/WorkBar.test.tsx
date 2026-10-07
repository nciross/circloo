import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import '../../../i18n'
import type { Member } from '../../../api/circles'
import { WorkBar } from './WorkBar'
import { stripFaces, stripMore } from './sidebar'

vi.mock('../SendResults', () => ({ SendResults: () => <button type="button">Send results</button> }))

const member = (id: string, name: string, role: Member['role'] = 'participant'): Member => ({ id, name, role, character: 'fox', ring: 0 })
const people = [member('a', 'Nadia', 'animator'), member('b', 'Théo'), member('c', 'Lucía'), member('d', 'Youssef'), member('e', 'Amina'), member('f', 'Kenji')]

type Props = Parameters<typeof WorkBar>[0]

function bar(over: Partial<Props> = {}) {
  const props: Props = {
    circleId: 'c1', name: 'Monday retro', isAnimator: true, closed: false, status: 'live', activity: null, startedBy: null,
    members: people, online: ['b'], meId: 'a', centreId: 'room-centre', onPeople: vi.fn(), onClose: vi.fn(() => Promise.resolve()), closing: false,
    ...over,
  }
  return { props, ui: <MemoryRouter><WorkBar {...props} /></MemoryRouter> }
}

/** jsdom has no matchMedia, which the room reads as a wide screen; a phone is a media query that never matches. */
function phone() {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
}

afterEach(() => vi.unstubAllGlobals())

describe('WorkBar', () => {
  it('names the circle, says the status in words and opens the People tab from the people strip', async () => {
    const { props, ui } = bar()
    render(ui)
    expect(screen.getByRole('region', { name: 'Room' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Monday retro')
    expect(screen.getByText('Live')).toBeInTheDocument()
    const strip = screen.getByRole('button', { name: '6 people in the circle. Show the list' })
    expect(strip).toHaveTextContent('+2')
    await userEvent.click(strip)
    expect(props.onPeople).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/app')
  })

  it('shows the round with who started it, offers the skip link and announces the change', () => {
    const { rerender } = render(bar().ui)
    expect(screen.queryByRole('link', { name: 'Skip to the board' })).toBeNull()
    rerender(bar({ activity: 'canvas', startedBy: 'a' }).ui)
    expect(screen.getByText('Live canvas')).toBeInTheDocument()
    expect(screen.getByText('started by Nadia')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to the board' })).toHaveAttribute('href', '#room-centre')
    expect(screen.getByRole('status')).toHaveTextContent('Nadia started Live canvas')
    rerender(bar({ activity: 'canvas', startedBy: 'a', status: 'reconnecting' }).ui)
    expect(screen.getByRole('status')).toHaveTextContent('Connection: Reconnecting…')
    rerender(bar({ activity: null, status: 'reconnecting' }).ui)
    expect(screen.getByRole('status')).toHaveTextContent('The round ended.')
  })

  it('does not announce the page arriving, only later connection changes', () => {
    const { rerender } = render(bar({ status: 'connecting' }).ui)
    rerender(bar({ status: 'live' }).ui)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('asks before closing the circle, with the focus on Cancel and back on Close after it', async () => {
    const { props, ui } = bar()
    render(ui)
    await userEvent.click(screen.getByRole('button', { name: 'Close circle' }))
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Close circle' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Close circle' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, close it for everyone' }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('folds the animator actions into a menu on phones', async () => {
    phone()
    render(bar().ui)
    expect(screen.queryByRole('button', { name: 'Close circle' })).toBeNull()
    const more = screen.getByRole('button', { name: 'Circle actions' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Close circle' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send results' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(more).toHaveFocus()
  })

  it('gives participants the strip but no actions and no Home link', () => {
    render(bar({ isAnimator: false }).ui)
    expect(screen.queryByRole('button', { name: 'Circle actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close circle' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
    expect(screen.getByRole('button', { name: /people in the circle/ })).toBeInTheDocument()
  })
})

describe('people strip', () => {
  it('puts people here first with the animator leading, and caps the rest at "+99"', () => {
    const faces = stripFaces([member('x', 'Away one'), ...people], ['b', 'c'], 'a')
    expect(faces.map((m) => m.id)).toEqual(['a', 'b', 'c', 'x'])
    expect(stripMore(4)).toBe('')
    expect(stripMore(16)).toBe('+12')
    expect(stripMore(140)).toBe('+99')
  })
})
