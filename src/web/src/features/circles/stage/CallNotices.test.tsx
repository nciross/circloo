import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../../i18n'
import { CALL_NOTICE_KINDS } from '../../../api/discussion'
import { CallNotices, NOTICE_MS } from './CallNotices'
import { noticeText } from './notices'
import { resetStage, useStage, type CallNotice } from './stage'

const t = i18n.getFixedT('en')
let n = 0
const notice = (kind: CallNotice['kind'], byMemberId: string | null = 'nadia', subjectMemberId: string | null = null): CallNotice =>
  ({ id: ++n, kind, byMemberId, subjectMemberId })

afterEach(() => {
  resetStage()
  vi.useRealTimers()
})

describe('noticeText', () => {
  it('has kind words for every notice, in every language', () => {
    for (const lng of ['en', 'fr', 'ar', 'es']) {
      const tl = i18n.getFixedT(lng)
      for (const kind of CALL_NOTICE_KINDS) {
        const text = noticeText(tl, notice(kind), 'amina')
        expect(text, `${lng} ${kind}`).toBeTruthy()
        expect(text, `${lng} ${kind}`).not.toContain('circles.call')
      }
      expect(noticeText(tl, notice('call-ended', null), 'amina')).not.toContain('circles.call')
    }
  })

  it('says the animator ended the call, or that they were away too long when nobody is named', () => {
    expect(noticeText(t, notice('call-ended'), 'amina')).toBe('The animator ended the call.')
    expect(noticeText(t, notice('call-ended', null), 'amina')).toBe('The animator was away too long, so the call ended.')
    expect(noticeText(t, notice('floor-given', 'nadia', 'amina'), 'amina')).toBe('You have the floor. Switch your microphone on when you are ready.')
  })

  it('tells the animator nothing about what they did themselves', () => {
    expect(noticeText(t, notice('video-off', 'nadia'), 'nadia')).toBeNull()
    expect(noticeText(t, notice('call-ended', null), 'nadia')).toBe('The animator was away too long, so the call ended.')
  })
})

describe('CallNotices', () => {
  it('stays in the page as an empty live region, then says the newest notice', () => {
    const { container } = render(<CallNotices meId="amina" />)
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    expect(container.firstChild).toHaveClass('is-empty')
    act(() => useStage.setState({ notices: [notice('call-started'), notice('mic-muted', 'nadia', 'amina')] }))
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('The animator switched your microphone off. You can still listen and chat.')
  })

  it('Dismiss takes the notice and the older ones away', async () => {
    useStage.setState({ notices: [notice('call-started'), notice('video-on')] })
    render(<CallNotices meId="amina" />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(useStage.getState().notices).toEqual([])
  })

  it('goes by itself after a while', () => {
    vi.useFakeTimers()
    useStage.setState({ notices: [notice('removed', 'nadia', 'amina')] })
    render(<CallNotices meId="amina" />)
    expect(screen.getByRole('status')).toHaveTextContent('The animator took you out of this call.')
    act(() => vi.advanceTimersByTime(NOTICE_MS))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('skips the animator’s own actions and shows the one before', () => {
    useStage.setState({ notices: [notice('call-started', 'theo'), notice('mode-open', 'nadia')] })
    render(<CallNotices meId="nadia" />)
    expect(screen.getByRole('status')).toHaveTextContent('The animator started a call.')
  })
})
