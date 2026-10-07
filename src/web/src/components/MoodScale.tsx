import { useTranslation } from 'react-i18next'
import { MoodIcon, type Mood } from './MoodIcon'

const MOODS: Mood[] = [1, 2, 3, 4, 5]

/** The five skies as one-tap chips: icon, word and fill, so mood is never colour alone (charte, MoodScale). */
export function MoodScale({ mood, onPick, label }: { mood: Mood | null; onPick: (m: Mood) => void; label: string }) {
  const { t } = useTranslation()
  return (
    <div className="moods" role="group" aria-label={label}>
      {MOODS.map((m) => (
        <button key={m} type="button" className="mood" aria-pressed={m === mood} onClick={() => onPick(m)}>
          <MoodIcon mood={m} size={22} />
          <span>{t(`landing.feel.moods.${m}`)}</span>
        </button>
      ))}
    </div>
  )
}
