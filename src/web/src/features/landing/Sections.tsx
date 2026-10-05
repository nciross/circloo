import { useTranslation } from 'react-i18next'
import { ArrowRight, Heart, Home, Plus, Users } from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { Avatar } from '../../components/Avatar'

interface Persona { id: 'friends' | 'families' | 'teams'; role: string; promise: string; card: string; cardSub: string; body: string }
interface GridItem { n: string; d: string; tag?: 'soon' }
interface FaqItem { q: string; a: string }

const PERSONA_ICON = { friends: Heart, families: Home, teams: Users } as const
const PERSONA_NAME = { friends: 'Théo', families: 'Amina', teams: 'Lucía' } as const

/** The thin strip above the nav: one honest line about early access and a pill link. */
export function AnnouncementBar() {
  const { t } = useTranslation()
  return (
    <div className="announce">
      <p>
        {t('landing.announce.text')}{' '}
        <a className="announce__pill" href="/signin">{t('landing.announce.link')}</a>
      </p>
    </div>
  )
}

/** Three native <details> rows sharing one name, so opening one closes the others without any script. */
export function Personas() {
  const { t } = useTranslation()
  const items = t('landing.personas.items', { returnObjects: true }) as Persona[]
  return (
    <section id="personas" className="band" aria-labelledby="personas-title">
      <div className="band__inner narrow">
        <div className="section-head">
          <p className="eyebrow">{t('landing.personas.eyebrow')}</p>
          <h2 id="personas-title" className="section-title">{t('landing.personas.title')}</h2>
        </div>
        <div className="accordion">
          {items.map((p, i) => {
            const Icon = PERSONA_ICON[p.id]
            return (
              <details key={p.id} className="acc" name="personas" open={i === 0}>
                <summary className="acc__sum">
                  <Icon size={20} aria-hidden="true" className="acc__icon" />
                  <span className="acc__role">{p.role}</span>
                  <span className="acc__promise">{p.promise}</span>
                  <Plus size={18} aria-hidden="true" className="acc__plus" />
                </summary>
                <div className="acc__body">
                  <div className={`persona persona--${p.id}`}>
                    <Avatar name={PERSONA_NAME[p.id]} size="md" />
                    <p className="persona__title">{p.card}</p>
                    <p className="persona__sub">{p.cardSub}</p>
                  </div>
                  <p>{p.body}</p>
                </div>
              </details>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/** Dense list of what is really in the product. Items not shipped yet say so. */
export function FeatureGrid({ soon }: { soon: string }) {
  const { t } = useTranslation()
  const items = t('landing.grid.items', { returnObjects: true }) as GridItem[]
  return (
    <section id="features" className="band band--tint" aria-labelledby="grid-title">
      <div className="band__inner">
        <div className="section-head section-head--center">
          <p className="eyebrow">{t('landing.grid.eyebrow')}</p>
          <h2 id="grid-title" className="section-title">{t('landing.grid.title')}</h2>
        </div>
        <ul className="fgrid">
          {items.map((it, i) => (
            <li key={it.n} className="fitem">
              <span className={`fitem__dot fitem__dot--${i % 3}`} aria-hidden="true" />
              <p className="fitem__name">
                {it.n} {it.tag ? <span className="pill">{soon}</span> : null}
              </p>
              <p className="fitem__desc">{it.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function Faq() {
  const { t } = useTranslation()
  const items = t('landing.faq.items', { returnObjects: true }) as FaqItem[]
  return (
    <section id="faq" className="band" aria-labelledby="faq-title">
      <div className="band__inner faq">
        <div className="faq__rail">
          <h2 id="faq-title" className="section-title">{t('landing.faq.title')}</h2>
          <p>{t('landing.faq.contact')}</p>
          <ButtonLink to="/signin" variant="default" size="md" icon={<ArrowRight className="flip-rtl" size={16} />}>
            {t('landing.cta')}
          </ButtonLink>
        </div>
        <div className="accordion">
          {items.map((f, i) => (
            <details key={f.q} className="acc" name="faq" open={i === 0}>
              <summary className="acc__sum acc__sum--faq">
                <span className="acc__role">{f.q}</span>
                <Plus size={18} aria-hidden="true" className="acc__plus" />
              </summary>
              <div className="acc__body acc__body--faq"><p>{f.a}</p></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
