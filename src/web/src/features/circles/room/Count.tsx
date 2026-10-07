import { useState } from 'react'
import { shortCount } from './sidebar'

/**
 * A count that pops once when it goes up (a message lands, someone arrives), never when it goes down or on first show.
 * The pop is a class removed when its animation ends; under reduced motion the CSS drops the animation and the number simply changes.
 */
export function Count({ value, className, children }: { value: number; className: string; children?: React.ReactNode }) {
  const [seen, setSeen] = useState({ value, pops: 0, popping: false })
  if (seen.value !== value) setSeen({ value, pops: value > seen.value ? seen.pops + 1 : seen.pops, popping: value > seen.value || seen.popping })
  return (
    <span key={seen.pops} className={`${className}${seen.popping ? ' is-pop' : ''}`} onAnimationEnd={() => setSeen((s) => ({ ...s, popping: false }))}>
      {shortCount(value)}
      {children}
    </span>
  )
}
