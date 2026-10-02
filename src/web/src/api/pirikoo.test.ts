import { describe, expect, it } from 'vitest'
import { parseEvents } from './pirikoo'

describe('Pirikoo event stream', () => {
  it('reads complete events and keeps the unfinished rest for the next chunk', () => {
    const first = parseEvents('data: {"t":"delta","text":"Hel"}\n\ndata: {"t":"delta","text":"lo "}\n\ndata: {"t":"do')
    expect(first.events).toEqual([
      { t: 'delta', text: 'Hel' },
      { t: 'delta', text: 'lo ' },
    ])
    expect(first.rest).toBe('data: {"t":"do')

    const second = parseEvents(first.rest + 'ne","text":"Hello","replaced":true}\n\n')
    expect(second.events).toEqual([{ t: 'done', text: 'Hello', replaced: true }])
    expect(second.rest).toBe('')
  })

  it('accepts CRLF line ends and skips broken or unknown events', () => {
    const { events } = parseEvents('data: not json\r\n\r\n: comment\r\n\r\ndata: {"t":"nope"}\r\n\r\ndata: {"t":"error","code":"limited"}\r\n\r\n')
    expect(events).toEqual([{ t: 'error', code: 'limited' }])
  })
})
