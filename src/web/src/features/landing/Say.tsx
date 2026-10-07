import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { Bird, type BirdMood } from '../pirikoo/Bird'
import { PROMPT_MAX } from '../../lib/circlePrompt'

/**
 * The console: a labelled line with the bird at its start and the Build button inside the box (#247). Enter builds,
 * Shift+Enter adds a line. `examples` are three lines the visitor can tap instead of typing.
 */
export function Say({
  text, onText, onBuild, onTouch, mood, examples, compact = false, idle,
}: {
  text: string
  onText: (text: string) => void
  onBuild: (text: string) => void
  /** The visitor took over: the auto-demo must not start. */
  onTouch?: () => void
  mood: BirdMood | undefined
  examples?: string[]
  compact?: boolean
  /** The bird while nothing happens and the field is not focused. */
  idle?: BirdMood
}) {
  const { t } = useTranslation()
  const id = useId()
  const [focused, setFocused] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onBuild(text)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onBuild(text)
    }
  }
  const bird: BirdMood | undefined = mood ?? (focused ? 'listening' : idle)
  return (
    <form className={`say${compact ? ' say--compact' : ''}`} onSubmit={submit}>
      <label className="say__label" htmlFor={`${id}-field`}>{t('landing.say.label')}</label>
      <div className="say__box">
        <span className="say__bird" aria-hidden="true"><Bird mood={bird} /></span>
        <textarea
          id={`${id}-field`}
          className="say__field"
          rows={1}
          maxLength={PROMPT_MAX}
          placeholder={t('landing.say.placeholder')}
          value={text}
          dir="auto"
          autoComplete="off"
          enterKeyHint="go"
          aria-describedby={`${id}-hint`}
          onChange={(e) => onText(e.target.value)}
          onFocus={() => {
            setFocused(true)
            onTouch?.()
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKey}
        />
        <button type="submit" className="say__go">
          <ArrowRight className="flip-rtl" size={20} strokeWidth={2.25} aria-hidden="true" />
          <span className={compact ? 'visually-hidden' : 'say__go-label'}>{t('landing.say.build')}</span>
        </button>
      </div>
      <p id={`${id}-hint`} className="say__hint">{t('landing.say.hint')}</p>
      {examples ? (
        <div className="say__examples" role="group" aria-label={t('landing.say.examples')}>
          {examples.map((line) => (
            <button
              key={line}
              type="button"
              className="say__example"
              onClick={() => {
                onTouch?.()
                onText(line)
                onBuild(line)
              }}
            >
              {line}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  )
}
