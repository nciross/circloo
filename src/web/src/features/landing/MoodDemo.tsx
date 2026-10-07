import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaceMark } from '../../components/Brand'
import { MoodIcon, type Mood } from '../../components/MoodIcon'

const MOODS: Mood[] = [1, 2, 3, 4, 5]

/** Pick a mood and the circloo face feels it with you: the logo explains the daily check-in. */
export function MoodDemo({ motion = true }: { motion?: boolean }) {
  const { t } = useTranslation()
  const [mood, setMood] = useState<Mood>(4)
  const word = t(`landing.feel.moods.${mood}`)
  return (
    <div className="mood-demo">
      <div className="mood-demo__stage">
        <FaceMark mood={mood} interactive={motion ? 'force' : false} className={`mood-demo__face mood-demo__face--m${mood}`} />
        <p className="mood-demo__says" aria-live="polite">{t('landing.feel.faceSays', { mood: word.toLocaleLowerCase() })}</p>
      </div>
      <div className="mood-demo__pick" role="group" aria-label={t('landing.feel.tryIt')}>
        <p className="mood-demo__ask" aria-hidden="true">{t('landing.feel.tryIt')}</p>
        <div className="moods">
          {MOODS.map((m) => (
            <button key={m} type="button" className="mood" aria-pressed={m === mood} onClick={() => setMood(m)}>
              <MoodIcon mood={m} size={22} />
              <span>{t(`landing.feel.moods.${m}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
