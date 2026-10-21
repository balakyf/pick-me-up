import type { CSSProperties } from 'react'
import { idleStyle } from './poses'

export interface LivingSpriteProps {
  /** stable unit id: drives the breathing / blinking phase */
  id: string
  /** the frame to show (idle or any pose) */
  src: string
  /** idle with shut eyes; omit for units that don't blink (monsters, objects, posed frames) */
  blinkSrc?: string
  width: number
  height: number
  className?: string
  alt?: string
  /** no breathing or blinking (posed frames, KO, reduced motion) */
  still?: boolean
}

/**
 * A sprite that breathes (1-px bob) and blinks on its own rhythm (spec 2026-10-12
 * S10). Pure CSS: the per-unit phase arrives as custom properties from `idleStyle`,
 * and ui.css's global reduced-motion rule stills it.
 */
export function LivingSprite({ id, src, blinkSrc, width, height, className, alt = '', still }: LivingSpriteProps) {
  const cls = ['blink-stack', still ? '' : 'idle-life', className ?? ''].filter(Boolean).join(' ')
  return (
    <span className={cls} style={(still ? undefined : idleStyle(id)) as CSSProperties | undefined}>
      <img className="px" src={src} width={width} height={height} alt={alt} draggable={false} />
      {blinkSrc && !still && <img className="px blink" src={blinkSrc} width={width} height={height} alt="" aria-hidden="true" draggable={false} />}
    </span>
  )
}
