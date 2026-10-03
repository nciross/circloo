import { keyAction } from './keys'

const key = (key: string, extra: Partial<Parameters<typeof keyAction>[0]> = {}) => ({
  key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, altKey: false, ctrlKey: false, metaKey: false, repeat: false,
  isComposing: false, defaultPrevented: false, target: document.body, ...extra,
})

describe('keyAction', () => {
  it('moves with the reading direction', () => {
    expect(keyAction(key('ArrowRight'), false)).toBe('next')
    expect(keyAction(key('ArrowLeft'), false)).toBe('prev')
    expect(keyAction(key('ArrowLeft'), true)).toBe('next')
    expect(keyAction(key('ArrowRight'), true)).toBe('prev')
    expect(keyAction(key('PageDown'), true)).toBe('next')
    expect(keyAction(key('PageUp'), false)).toBe('prev')
    expect(keyAction(key(' ', { code: 'Space' }), false)).toBe('next')
  })

  it('blanks with the B key on any layout', () => {
    expect(keyAction(key('b'), false)).toBe('blank')
    expect(keyAction(key('لا', { code: 'KeyB' }), true)).toBe('blank')
  })

  it('leaves fields, menus, focused buttons, held keys and shortcuts alone', () => {
    const input = document.createElement('input')
    const button = document.createElement('button')
    const slider = document.createElement('div')
    slider.setAttribute('role', 'slider')
    expect(keyAction(key('ArrowRight', { target: input }), false)).toBeNull()
    expect(keyAction(key('b', { target: input }), false)).toBeNull()
    expect(keyAction(key('ArrowRight', { target: slider }), false)).toBeNull()
    expect(keyAction(key(' ', { code: 'Space', target: button }), false)).toBeNull()
    expect(keyAction(key('ArrowRight', { target: button }), false)).toBe('next')
    expect(keyAction(key('ArrowRight', { repeat: true }), false)).toBeNull()
    expect(keyAction(key('ArrowRight', { ctrlKey: true }), false)).toBeNull()
    expect(keyAction(key('b', { isComposing: true }), false)).toBeNull()
    expect(keyAction(key('Enter'), false)).toBeNull()
  })
})
