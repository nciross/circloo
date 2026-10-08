import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { listVariants, rowVariants } from '../../lib/motion'
import { useStatic } from './still'

/**
 * One band of the page: white or dark, full-bleed, with the site's column inside. Every section below the hero is
 * one of these so the rhythm (white, dark, white...) is set in one place.
 */
export function Band({ id, tone = 'light', sunken = false, className, label, labelledBy, children }: {
  id?: string
  tone?: 'light' | 'dark'
  sunken?: boolean
  className?: string
  label?: string
  labelledBy?: string
  children: ReactNode
}) {
  const cls = ['band', tone === 'dark' ? 'band--dark' : sunken ? 'band--sunken' : null, className].filter(Boolean).join(' ')
  return (
    <section id={id} className={cls} aria-label={label} aria-labelledby={labelledBy}>
      <div className="band__inner">{children}</div>
    </section>
  )
}

/**
 * A group that arrives when it scrolls into view, once: children rise 8px one after another on transform only, so
 * the text keeps its contrast while it settles (axe runs on the page). Static under reduced motion or a pause.
 */
export function Reveal({ as = 'div', className, children, stagger = 0.06 }: {
  as?: 'div' | 'ul' | 'ol'
  className?: string
  children: ReactNode
  stagger?: number
}) {
  const fixed = useStatic()
  const Tag = motion[as]
  return (
    <Tag
      className={className}
      variants={listVariants(fixed, stagger)}
      initial={fixed ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </Tag>
  )
}

/** One row of a Reveal. */
export function Item({ as = 'div', className, children, id }: { as?: 'div' | 'li' | 'article'; className?: string; children: ReactNode; id?: string }) {
  const fixed = useStatic()
  const Tag = motion[as]
  return (
    <Tag id={id} className={className} variants={rowVariants(fixed)}>
      {children}
    </Tag>
  )
}

/** The eyebrow → headline → one line ladder every band opens with. */
export function BandHead({ id, eyebrow, title, lead, align = 'start', className }: {
  id: string
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  align?: 'start' | 'center' | 'split'
  className?: string
}) {
  return (
    <div className={['band__head', `band__head--${align}`, className].filter(Boolean).join(' ')}>
      <div className="band__head-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={id} className="band__title">{title}</h2>
      </div>
      {lead ? <p className="band__lead">{lead}</p> : null}
    </div>
  )
}
