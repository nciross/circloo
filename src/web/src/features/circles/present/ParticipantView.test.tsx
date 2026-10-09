import { afterEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import '../../../i18n'
import { DEFAULT_SETTINGS, useRoom } from '../room'
import { useReactions } from '../room/reactions'
import { ParticipantView } from './ParticipantView'
import { useLive, type PresentationState } from './presentation'

const base = { sessionId: 's1', presentationName: 'Kickoff', position: 0, count: 3, blank: false, phase: 'idle', serverNow: new Date().toISOString(), version: 1 } as const
const deck: PresentationState = { ...base, slide: { kind: 'deck', slideId: 'a', image: '/a.png' } }
const poll: PresentationState = {
  ...base, version: 2, position: 1, phase: 'answering',
  slide: { kind: 'poll', slideId: 'b', question: 'Coffee or tea?', options: [{ id: 'x', text: 'Coffee' }, { id: 'y', text: 'Tea' }], multipleChoice: false, showFirst: true, showLive: false },
}

afterEach(() => {
  useLive.getState().reset()
  useReactions.getState().reset()
  useRoom.setState({ settings: DEFAULT_SETTINGS })
})

describe('reactions in the participant view', () => {
  it('shows no bar until a presentation runs, then the bar under the slide and the layer over it', () => {
    const { container } = render(<ParticipantView />)
    expect(screen.queryByRole('group', { name: 'Send a reaction' })).toBeNull()
    act(() => useLive.setState({ state: deck }))
    expect(screen.getByRole('group', { name: 'Send a reaction' })).toBeInTheDocument()
    expect(container.querySelector('.follow__stage .reaction-layer')).not.toBeNull()
    act(() => useReactions.getState().receive({ clap: 3 }))
    expect(container.querySelectorAll('.follow__stage .reaction-layer__float')).toHaveLength(3)
    expect(container.querySelector('.follow__foot .reaction-tally__chip')).toHaveTextContent('×3')
  })

  it('never floats over the answer buttons: on a question only the grouped count shows', () => {
    useLive.setState({ state: poll })
    const { container } = render(<ParticipantView />)
    act(() => useReactions.getState().receive({ heart: 2 }))
    expect(screen.getAllByRole('button', { name: /Coffee|Tea/ })).toHaveLength(2)
    expect(container.querySelector('.reaction-layer')).toBeNull()
    expect(container.querySelector('.reaction-tally__chip')).toHaveTextContent('×2')
  })

  it('hides the bar when the animator switches reactions off', () => {
    useLive.setState({ state: deck })
    render(<ParticipantView />)
    act(() => useRoom.setState({ settings: { ...DEFAULT_SETTINGS, reactions: false } }))
    expect(screen.queryByRole('group', { name: 'Send a reaction' })).toBeNull()
  })
})
