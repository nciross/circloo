import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../i18n'
import { DeviceProblem } from './DeviceProblem'
import type { MediaKind, MediaProblem } from './media'

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const show = (problem: MediaProblem, kind: MediaKind = 'audio', on: { onRetry?: () => void; onDismiss?: () => void } = {}) =>
  render(<DeviceProblem problem={{ id: 1, kind, problem }} onRetry={on.onRetry ?? (() => {})} onDismiss={on.onDismiss ?? (() => {})} />)

afterEach(() => {
  // The user agent of jsdom again.
  delete (navigator as { userAgent?: string }).userAgent
})

describe('DeviceProblem', () => {
  it.each<[MediaProblem, MediaKind, string, boolean]>([
    ['denied', 'audio', 'Your browser is blocking the microphone. You can still listen, chat and raise your hand.', true],
    ['denied', 'video', 'Your browser is blocking the camera. The others see your character instead.', true],
    ['no-device', 'audio', 'No microphone found. You can still listen, chat and raise your hand.', true],
    ['no-device', 'video', 'No camera found. The others see your character instead.', true],
    ['busy', 'audio', 'Another app is using your microphone. Close it, then try again.', true],
    ['busy', 'video', 'Another app is using your camera. Close it, then try again.', true],
    ['blocked', 'audio', 'A setting on this device or in your organisation blocks the microphone here. You can still listen, chat and raise your hand.', false],
    ['blocked', 'video', 'A setting on this device or in your organisation blocks the camera here. The others see your character instead.', false],
    ['unsupported', 'audio', 'This browser cannot use a microphone on this page. You can still listen, chat and raise your hand.', false],
    ['unsupported', 'video', 'This browser cannot use a camera on this page. The others see your character instead.', false],
  ])('%s %s: says what happened and what still works, as an alert', (problem, kind, text, retry) => {
    show(problem, kind)
    expect(screen.getByRole('alert')).toHaveTextContent(text)
    expect(screen.queryByRole('button', { name: 'Try again' }) !== null).toBe(retry)
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('tells how to allow a blocked device again, in this browser’s words', () => {
    const { unmount } = show('denied', 'audio')
    expect(screen.getByRole('alert')).toHaveTextContent("open this site's settings in your browser and allow the microphone")
    unmount()
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: CHROME })
    show('denied', 'video')
    expect(screen.getByRole('alert')).toHaveTextContent('click the icon at the start of the address bar, set the camera to Allow')
  })

  it('gives no steps for a problem the browser did not cause', () => {
    show('busy')
    expect(screen.getByRole('alert')).not.toHaveTextContent('To allow it again')
  })

  it('Try again and Dismiss', async () => {
    const onRetry = vi.fn()
    const onDismiss = vi.fn()
    show('busy', 'audio', { onRetry, onDismiss })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
