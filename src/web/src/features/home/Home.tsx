import { Trans, useTranslation } from 'react-i18next'
import { useMe } from '../../api/hooks'
import { useDocumentTitle } from '../../app/locale'
import { Freezer } from '../../components/Freezer'
import { IcebreakerCard } from '../landing/IcebreakerCard'
import { AccountMenu } from './AccountMenu'
import { MagnetLink } from '../../components/Magnet'
import { ArrowRight } from 'lucide-react'
import '../../styles/app.css'

const NEXT = ['icebreakers', 'checkins', 'boards', 'integrations'] as const

export default function Home() {
  const { t } = useTranslation()
  useDocumentTitle('common.home')
  const { data: me } = useMe()

  return (
    <div className="fridge">
      <Freezer homeTo="/app">
        <AccountMenu />
      </Freezer>
      <main id="main" className="door">
        <span className="door__handle" aria-hidden="true" />
        <div className="home-door">
          <section className="home-hello" aria-labelledby="hello">
            <div className="paper-strip paper-strip--wide">
              <span className="pin-magnet pin-magnet--sunflower" aria-hidden="true" />
              <h1 id="hello" className="paper-strip__title">
                <Trans i18nKey="home.greeting" values={{ name: me?.displayName ?? '' }} components={{ name: <bdi /> }} />
              </h1>
            </div>
            <p className="hero__sub">{t('home.lead')}</p>
            <MagnetLink to="/app/icebreakers" size="lg" icon={<ArrowRight className="flip-rtl" size={22} strokeWidth={2.5} />}>
              {t('home.start')}
            </MagnetLink>
            <div className="home-play">
              <IcebreakerCard />
            </div>
          </section>

          <section className="next-note" aria-labelledby="next">
            <span className="pin-magnet pin-magnet--tomato" aria-hidden="true" />
            <h2 id="next" className="next-note__title">{t('home.nextTitle')}</h2>
            <ul className="next-list">
              {NEXT.map((id) => (
                <li key={id} className="next-list__item">
                  <span className="next-list__box" aria-hidden="true" />
                  <div>
                    <h3 className="next-list__name">
                      {t(`home.modules.${id}.title`)}{' '}
                      <span className={`tag ${id === 'icebreakers' ? 'tag--first' : 'tag--soon'}`}>
                        {id === 'icebreakers' ? t('home.modules.icebreakers.tag') : t('common.soon')}
                      </span>
                    </h3>
                    <p>{t(`home.modules.${id}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  )
}
