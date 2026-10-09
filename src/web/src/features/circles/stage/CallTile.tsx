import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MicOff } from 'lucide-react'
import type { Member } from '../../../api/circles'
import { Character } from '../../../components/Character'
import type { CallParticipant } from './call'
import { toneOf } from './grid'

/**
 * One person in the call (FR-912): their video over their character on their own pastel, never an empty box; their
 * name on a white pill with a struck microphone when it is off. Speaking is an ink outline and the word "Speaking", never
 * colour alone; the sound bars beside the word move only without reduced motion, the word itself never moves.
 */
export function CallTile({ person, member, floor, big = false }: { person: CallParticipant; member?: Member; floor: boolean; big?: boolean }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLVideoElement>(null)
  const video = person.video

  useEffect(() => {
    const el = ref.current
    if (!video || !el) return
    video.attach(el)
    return () => video.detach(el)
  }, [video])

  const name = member?.name || person.name
  const weak = person.quality === 'poor' || person.quality === 'lost'
  const states = [person.mic ? null : t('circles.call.micOff'), person.camera ? t('circles.call.cameraOn') : null].filter(Boolean).join(', ')

  return (
    <li
      className={['call-tile', video ? 'has-video' : '', person.speaking ? 'is-speaking' : '', person.local ? 'is-self' : '', big ? 'is-big' : ''].filter(Boolean).join(' ')}
      data-member={person.id}
      data-tone={toneOf(person.id)}
    >
      {/* The character stays under the video, so a video that is still starting or paused never shows an empty box. */}
      {member ? <Character id={member.character} ring={member.ring} tag={false} className="call-tile__char" /> : null}
      {video ? <video ref={ref} className="call-tile__video" autoPlay playsInline muted /> : null}
      {/* The name comes first for a screen reader; everything on the tile is placed by CSS. */}
      <p className="call-tile__name">
        {person.mic ? null : <MicOff size={14} aria-hidden="true" className="call-tile__mic" />}
        <bdi className="call-tile__who">{name}</bdi>
        {person.local ? <span className="call-tile__you"> {t('circles.call.you')}</span> : null}
        {states ? <span className="visually-hidden">, {states}</span> : null}
      </p>
      {person.speaking || floor ? (
        <span className="call-tile__marks">
          {person.speaking ? (
            <span className="call-tile__speaking">
              <span className="call-tile__bars" aria-hidden="true"><i /><i /><i /></span>
              {t('circles.call.speaking')}
            </span>
          ) : null}
          {floor ? <span className="call-tile__floor">{t('circles.call.hasFloor')}</span> : null}
        </span>
      ) : null}
      {weak ? <span className="call-tile__weak">{t('circles.call.weak')}</span> : null}
    </li>
  )
}
