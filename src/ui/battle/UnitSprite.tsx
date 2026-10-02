import type { CombatUnitInit } from '../../engine/types'
import { hpColor } from '../bits'
import type { Pose } from './choreo'

/** How one unit looks on this frame (BattleScene works it out; this only draws it). */
export interface UnitLook {
  /** Feet position on the 384×216 canon. */
  x: number
  y: number
  size: { w: number; h: number }
  src: string
  pose: Pose | undefined
  acting: boolean
  hurt: boolean
  dead: boolean
  falling: boolean
  entering: boolean
  cheering: boolean
  aimable: boolean
  /** HP left, 0–100. */
  hpPct: number
  /** The skill's colour when this unit takes a skill hit. */
  skillFlash: string | null
  /** The skill name banner over a caster. */
  banner: { name: string; color: string } | null
  turnMark: boolean
  panic: boolean
  /** Staggers the march-in. */
  enterDelayMs: number
}

/** One fighter on the stage: sprite, shadow, HP sliver, and the marks of the moment. */
export function UnitSprite({ u, look, onClick }: { u: CombatUnitInit; look: UnitLook; onClick: () => void }) {
  const isHero = u.side === 'hero'
  const { x, y, size, pose } = look
  const cls = [
    'bunit',
    isHero ? 'hero' : 'enemy',
    look.acting ? 'acting' : '',
    look.hurt ? 'hurt' : '',
    look.dead ? 'ko' : '',
    look.falling ? 'falling' : '',
    look.entering ? 'entering' : '',
    look.cheering ? 'cheer' : '',
    look.aimable ? 'aimable' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div
      className={cls}
      onClick={onClick}
      style={{
        left: x - size.w / 2,
        top: y - size.h,
        width: size.w,
        height: size.h,
        zIndex: pose?.z ?? y,
        transform: pose ? `translate(${pose.dx}px, ${pose.dy}px)` : undefined,
        ['--enter-delay' as string]: `${look.enterDelayMs}ms`,
        ...(look.skillFlash ? { ['--skill-color' as string]: look.skillFlash } : {}),
      }}
    >
      {look.skillFlash && <div className="skill-flash" />}
      {look.banner && (
        <div className="skill-banner" style={{ borderColor: look.banner.color }}>
          {look.banner.name}
        </div>
      )}
      <div className="bshadow" style={{ width: size.w * 0.7 }} />
      {look.src && <img className="px bsprite" src={look.src} width={size.w} height={size.h} alt={u.name} />}
      {look.turnMark && <div className="turn-mark" aria-hidden="true" />}
      {!look.dead && (
        <div className={`bhp ${isHero && !u.isNpc ? 'hero-hp' : ''}`}>
          <span style={{ width: `${look.hpPct}%`, background: hpColor(look.hpPct) }} />
        </div>
      )}
      {look.panic && <span className="bsweat">💧</span>}
    </div>
  )
}
