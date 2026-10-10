import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../../i18n'
import { PermissionPrimer } from './PermissionPrimer'

const SENTENCE = "Your camera and microphone go to the people in this call through circloo's call server. Nothing is recorded or kept."

describe('PermissionPrimer', () => {
  it('says the one sentence, with Continue focused and described by it', () => {
    render(<PermissionPrimer kind="audio" onContinue={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('group', { name: 'Microphone' })).toHaveTextContent(SENTENCE)
    const go = screen.getByRole('button', { name: 'Continue' })
    expect(go).toHaveFocus()
    expect(go).toHaveAccessibleDescription(SENTENCE)
  })

  it('names the camera when it is the camera', () => {
    render(<PermissionPrimer kind="video" onContinue={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('group', { name: 'Camera' })).toBeInTheDocument()
  })

  it('Continue goes on; Not now and Escape ask nothing', async () => {
    const onContinue = vi.fn()
    const onCancel = vi.fn()
    render(<PermissionPrimer kind="audio" onContinue={onContinue} onCancel={onCancel} />)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onContinue).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('exists in every language', async () => {
    for (const lng of ['fr', 'ar', 'es']) {
      await i18n.changeLanguage(lng)
      const { unmount } = render(<PermissionPrimer kind="audio" onContinue={() => {}} onCancel={() => {}} />)
      expect(screen.getByRole('group').textContent).not.toContain('circles.call')
      expect(screen.getByRole('group').textContent).toContain('circloo')
      unmount()
    }
    await i18n.changeLanguage('en')
  })
})
