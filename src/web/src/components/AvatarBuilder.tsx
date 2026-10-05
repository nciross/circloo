import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Dices } from 'lucide-react'
import { Character } from './Character'
import {
  AVATAR_COUNTS, DEFAULT_AVATAR, HAIR, OUTFIT, SKIN, decodeAvatar, encodeAvatar, randomAvatar,
  type Avatar, type AvatarCode, type AvatarField,
} from './avatarCode'
import '../styles/avatar.css'

/** Fields shown as colour dots; the others are named styles. */
const COLOURS: Partial<Record<AvatarField, string[]>> = { skin: SKIN, hairColor: HAIR, outfit: OUTFIT }
const GROUPS: AvatarField[] = ['face', 'skin', 'hair', 'hairColor', 'beard', 'glasses', 'outfit', 'mouth']

/**
 * Build your own character: a live preview and one radio group per option. Every change calls `onChange` with
 * the new id, so the person is "wearing" it as soon as they touch anything. No gender field: hair, beard and
 * outfit are open to everyone.
 */
export function AvatarBuilder({ code, onChange }: { code: AvatarCode | null; onChange: (code: AvatarCode) => void }) {
  const { t } = useTranslation()
  const uid = useId()
  const avatar = code ? decodeAvatar(code) : DEFAULT_AVATAR
  const set = (field: AvatarField, value: number) => onChange(encodeAvatar({ ...avatar, [field]: value } as Avatar))

  return (
    <div className="build">
      <div className="build__preview">
        <Character id={encodeAvatar(avatar)} className="build__char" />
        <button type="button" className="btn btn--default btn--sm" onClick={() => onChange(encodeAvatar(randomAvatar()))}>
          <span className="btn__icon" aria-hidden="true"><Dices size={14} /></span>
          <span className="btn__label">{t('avatar.surprise')}</span>
        </button>
      </div>
      <div className="build__groups">
        {GROUPS.map((field) => {
          const colours = COLOURS[field]
          return (
            <fieldset key={field} className="build__group">
              <legend className="build__legend">{t(`avatar.fields.${field}`)}</legend>
              <div className={colours ? 'build__dots' : 'build__chips'}>
                {Array.from({ length: AVATAR_COUNTS[field] }, (_, i) => {
                  const label = colours ? t('avatar.colour', { n: i + 1 }) : t(`avatar.options.${field}.${i}`)
                  return (
                    <label key={i} className={`build__opt${avatar[field] === i ? ' is-picked' : ''}`}>
                      <input type="radio" name={`${uid}-${field}`} checked={avatar[field] === i} onChange={() => set(field, i)} aria-label={label} />
                      {colours ? <span className="build__dot" ref={(el) => el?.style.setProperty('--c', colours[i] ?? '#ccc')} aria-hidden="true" /> : <span>{label}</span>}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )
        })}
      </div>
    </div>
  )
}
