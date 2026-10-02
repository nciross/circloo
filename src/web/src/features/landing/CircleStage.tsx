import { useEffect, useState } from 'react'
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

/**
 * The circle forming: people join one by one, each as their character, and take a seat on the ring.
 * The circloo face in the middle gets happier with every arrival. Decorative: the same story is in
 * the copy next to it, so the stage is hidden from assistive tech.
 */
export function CircleStage() {
  const { t } = useTranslation()
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [joined, setJoined] = useState(still ? SEATS.length : 0)

  useEffect(() => {
    if (still) return
    const id = window.setInterval(() => setJoined((n) => (n >= SEATS.length ? n : n + 1)), 650)
    return () => window.clearInterval(id)
  }, [still])

  const mood: Mood = joined === 0 ? 3 : joined < 4 ? 4 : 5
  return (
    <div className="stage" aria-hidden="true">
      <div className="stage__ring" />
      <div className="stage__orbit">
        {SEATS.map((s, i) => (
          <div key={s.id} className={`seat seat--${i}${i < joined ? ' is-in' : ''}`}>
            <div className="seat__body">
              <Character id={s.id} className="seat__char" />
              <span className="seat__name">{s.name}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="stage__center">
        <FaceMark mood={mood} interactive className="stage__face" />
        <p className="stage__count">{t('landing.stage.joined', { count: joined })}</p>
      </div>
    </div>
  )
}
