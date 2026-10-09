import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { Character } from '../../../components/Character'
import { rowVariants, spring, useReducedMotion } from '../../../lib/motion'
import { useRoom } from '../room'
import { HandButton } from './HandButton'
import { useHandAction } from './useHandAction'
import { myHand, queueMembers, waitedMinutes } from './hands'
import '../../../styles/hands.css'

/** The animator's waiting times move on by the minute; a tick every 15 s keeps them within a quarter of one. */
const TICK = 15_000

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    // The clock may have stood still while nobody waited: the first tick comes at once.
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, TICK)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [active])
  return now
}

/**
 * The raised hands of the room (spec 008 US5), for everyone: who is speaking and who is next, then the queue in the
 * order hands went up, each with their character, ring and name (clarification 2). A participant raises and lowers
 * their hand here and sees their place ("You are 3rd"); the animator sees how long each hand has waited, gives the floor,
 * lowers one hand or all of them. It reads the room store only, so the call bar (spec 009 T927) can show it as is;
 * `button={false}` leaves the Raise hand button to a bar that has its own.
 */
export function HandsQueue({ className, button = true }: { className?: string; button?: boolean }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const hands = useRoom((s) => s.hands)
  const members = useRoom((s) => s.members)
  const me = useRoom((s) => s.me)
  const isAnimator = me?.role === 'animator'
  const [buttonError, setButtonError] = useState<string | null>(null)
  const onButtonError = useCallback((m: string | null) => setButtonError(m), [])
  const { busy, error, run } = useHandAction()
  const titleId = useId()
  const queue = queueMembers(hands, members)
  const now = useNow(isAnimator && queue.length > 0)
  const speaker = hands.floor ? members.find((m) => m.id === hands.floor) : undefined
  const next = queue[0]?.member
  const mine = myHand(hands, me?.id)
  const shownError = error ?? buttonError

  const root = useRef<HTMLDivElement>(null)
  const room = useRoom.getState
  /**
   * Runs an action; when it took away the row (or the block) that had the focus, the focus stays in the queue: the row
   * now at the same place, else the last one, else End turn, else the line's title. The hub sends the new queue before
   * it answers, so the rows are current once the next frame is drawn.
   */
  const act = (key: string, action: () => Promise<void>, at?: number) =>
    void run(key, action).then(() =>
      window.requestAnimationFrame(() => {
        const el = root.current
        if (!el || el.contains(document.activeElement)) return
        const gives = el.querySelectorAll<HTMLElement>('.hands__give')
        const target = (at !== undefined ? (gives[at] ?? gives[gives.length - 1]) : undefined) ?? el.querySelector<HTMLElement>('.hands__end') ?? el.querySelector<HTMLElement>('.hands__title')
        target?.focus()
      }),
    )

  return (
    <div ref={root} className={['hands', className].filter(Boolean).join(' ')}>
      {!isAnimator && me ? (
        <div className="hands__me">
          {mine.kind !== 'none' ? (
            <p className="hands__place">{mine.kind === 'floor' ? t('circles.hands.youHaveFloor') : t('circles.hands.place', { count: mine.place, ordinal: true })}</p>
          ) : null}
          {button ? <HandButton className="hands__btn" onError={onButtonError} /> : null}
        </div>
      ) : null}

      {speaker || next ? (
        <div className={['hands__now', speaker ? 'has-floor' : ''].filter(Boolean).join(' ')}>
          {speaker ? (
            <span className="hands__now-char">
              <Character id={speaker.character} ring={speaker.ring} tag={false} />
            </span>
          ) : null}
          <p className="hands__now-text">
            {speaker ? (
              <span className="hands__speaking">
                <Trans i18nKey="circles.hands.speaking" values={{ name: speaker.name }} components={{ name: <bdi /> }} />
              </span>
            ) : null}
            {speaker && next ? <span className="hands__dot" aria-hidden="true"> · </span> : null}
            {speaker && next ? <span className="visually-hidden">. </span> : null}
            {next ? (
              <span className="hands__next">
                <Trans i18nKey="circles.hands.next" values={{ name: next.name }} components={{ name: <bdi /> }} />
              </span>
            ) : null}
          </p>
          {isAnimator && speaker ? (
            <button type="button" className="btn btn--default btn--sm hands__end" aria-busy={busy === 'end' || undefined}
              onClick={() => act('end', () => room().lowerHand(speaker.id))}>
              {t('circles.hands.endTurn')}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="hands__line" aria-labelledby={titleId}>
        <div className="hands__head">
          <h2 id={titleId} className="hands__title" tabIndex={-1}>{t('circles.hands.title', { count: queue.length })}</h2>
          {/* On top, so it stays in reach with a long line (and clear of the corner bubble). */}
          {isAnimator && (queue.length > 0 || speaker) ? (
            <button type="button" className="btn btn--subtle btn--sm hands__all" aria-busy={busy === 'all' || undefined}
              onClick={() => act('all', () => room().lowerAllHands())}>
              {t('circles.hands.lowerAll')}
            </button>
          ) : null}
        </div>
        {queue.length === 0 ? (
          <p className="hands__empty field__help">{isAnimator ? t('circles.hands.emptyAnimator') : t('circles.hands.emptyParticipant')}</p>
        ) : (
          <ol className="hands__queue">
            {queue.map(({ member, raisedAt }, i) => {
              const minutes = waitedMinutes(raisedAt, now)
              return (
                <motion.li
                  key={member.id}
                  layout={reduced ? false : 'position'}
                  transition={spring.soft}
                  variants={rowVariants(reduced)}
                  initial="hidden"
                  animate="show"
                  className={['hands__row', 'buddy', isAnimator ? 'has-actions' : '', member.id === me?.id ? 'is-me' : ''].filter(Boolean).join(' ')}
                  data-member={member.id}
                >
                  <span className="buddy__char hands__char">
                    <Character id={member.character} ring={member.ring} tag={false} />
                  </span>
                  <span className="hands__text">
                    <span className="buddy__name hands__name">
                      <bdi>{member.name}</bdi>
                      {member.id === me?.id ? <span className="hands__you"> ({t('circles.you')})</span> : null}
                    </span>
                    {isAnimator ? (
                      <span className="buddy__status hands__waited">{minutes < 1 ? t('circles.hands.waitedNow') : t('circles.hands.waited', { count: minutes })}</span>
                    ) : null}
                  </span>
                  {isAnimator ? (
                    <span className="hands__actions">
                      <button type="button" className="btn btn--primary btn--sm hands__give" aria-label={t('circles.hands.giveTo', { name: member.name })}
                        aria-busy={busy === `give:${member.id}` || undefined} onClick={() => act(`give:${member.id}`, () => room().giveFloor(member.id), i)}>
                        {t('circles.hands.give')}
                      </button>
                      <button type="button" className="btn btn--default btn--sm hands__lower" aria-label={t('circles.hands.lowerOf', { name: member.name })}
                        aria-busy={busy === `lower:${member.id}` || undefined} onClick={() => act(`lower:${member.id}`, () => room().lowerHand(member.id), i)}>
                        {t('circles.hands.lowerShort')}
                      </button>
                    </span>
                  ) : (
                    <span className="buddy__value hands__pos" aria-hidden="true">{i + 1}</span>
                  )}
                </motion.li>
              )
            })}
          </ol>
        )}
      </section>
      {shownError ? <p className="field__error hands__error" role="alert">{shownError}</p> : null}
    </div>
  )
}
