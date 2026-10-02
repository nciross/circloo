import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaceMark } from '../../components/Brand'
import { Character } from '../../components/Character'
import type { CharacterId } from '../../components/characters'
import type { Mood } from '../../components/MoodIcon'

const SEATS: { id: CharacterId; name: string }[] = [
  { id: 'panda', name: 'Amina' },
  { id: 'fox', name: 'Théo' },
  { id: 'octopus', name: 'Lucía' },
  { id: 'robot', name: 'Youssef' },
  { id: 'frog', name: 'Mia' },
  { id: 'owl', name: 'Kenji' },
  { id: 'bunny', name: 'Sara' },
  { id: 'dino', name: 'Noah' },
]

const TRICKS = ['jump', 'spin', 'wiggle'] as const
type Trick = (typeof TRICKS)[number]

/**
 * The circle forming, then playing: people join one by one as their character and take a seat on the ring.
 * Once everyone is in, someone does a little trick now and then (a jump, a spin, a wiggle, with hearts),
 * the face in the middle cheers, and a click makes anyone hop. Decorative: the copy next to it tells the
 * same story, so it is hidden from assistive tech. Reduced motion keeps everyone seated and still.
 */
export function CircleStage() {
  const { t } = useTranslation()
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [joined, setJoined] = useState(still ? SEATS.length : 0)
  const [trick, setTrick] = useState<{ seat: number; kind: Trick; n: number } | null>(null)
  const last = useRef(-1)
  const count = useRef(0)
  const clear = useRef(0)

  // People arrive one by one.
  useEffect(() => {
    if (still) return
    const id = window.setInterval(() => setJoined((n) => (n >= SEATS.length ? n : n + 1)), 650)
    return () => window.clearInterval(id)
  }, [still])

  const play = (seat: number, kind: Trick) => {
    last.current = seat
    count.current += 1
    setTrick({ seat, kind, n: count.current })
    window.clearTimeout(clear.current)
    clear.current = window.setTimeout(() => setTrick(null), 1100)
  }

  // Then the fun: a random friend does a trick every couple of seconds.
  useEffect(() => {
    if (still || joined < SEATS.length) return
    const id = window.setInterval(() => {
      let seat = Math.floor(Math.random() * SEATS.length)
      if (seat === last.current) seat = (seat + 3) % SEATS.length
      play(seat, TRICKS[Math.floor(Math.random() * TRICKS.length)]!)
    }, 1900)
    return () => window.clearInterval(id)
  }, [still, joined])

  useEffect(() => () => window.clearTimeout(clear.current), [])

  const mood: Mood = joined === 0 ? 3 : joined < 4 ? 4 : 5
  return (
    <div className={`stage${trick ? ' is-cheering' : ''}`} aria-hidden="true">
      <svg className="stage__ring" viewBox="0 0 100 100">
        <circle className="stage__glow" cx="50" cy="50" r="27" />
        <circle className="stage__track" cx="50" cy="50" r="41" pathLength={100} />
      </svg>
      <div className="stage__orbit">
        {SEATS.map((s, i) => {
          const playing = trick?.seat === i ? trick : null
          return (
            <div key={s.id} className={`seat seat--${i}${i < joined ? ' is-in' : ''}${playing ? ` is-${playing.kind}` : ''}`}>
              <div className="seat__body" onClick={() => !still && i < joined && play(i, 'jump')}>
                {playing ? (
                  <span key={playing.n} className="seat__hearts">
                    {[0, 1, 2].map((h) => (
                      <svg key={h} className={`seat__heart seat__heart--${h}`} viewBox="0 0 24 24">
                        <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
                      </svg>
                    ))}
                  </span>
                ) : null}
                <span className="seat__hop">
                  <Character id={s.id} className="seat__char" />
                </span>
                <span className="seat__name">{s.name}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="stage__center">
        <FaceMark mood={trick ? 5 : mood} interactive className="stage__face" />
        <p className="stage__count">{t('landing.stage.joined', { count: joined })}</p>
      </div>
    </div>
  )
}
