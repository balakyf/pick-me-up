/**
 * Which body a hero shows on this beat (lane I), pure: the fallen lie down, the winners
 * cheer, a striker lunges or a caster raises the spell, a struck hero flinches, a braced one
 * guards, everyone else breathes. BattleScene asks per unit per frame; the pose names a
 * fixed bitmap (heroSprite.drawHeroPose), so nothing about the moment reaches a cache key.
 */
import type { CombatEvent, HeroClass } from '../../engine/types'
import { SKILLS } from '../../engine/content'
import type { HeroPose } from '../pixel/heroSprite'
import type { StatusMark } from './statusCaptions'

/** A hero bracing under the Master's Guard (engine/combat BRACE_ID). */
const BRACE = 'brace'

/**
 * Whether a skill reads as a spell (the cast pose) rather than a weapon blow (the attack
 * pose): magic, a support skill (no blow of its own: a heal, a shield, a war cry), a caster
 * foe's Spell, or anything a mage does.
 */
export function castsSkill(skillId: string | null, unitClass: HeroClass | null): boolean {
  if (skillId === BRACE) return false
  if (skillId === 'e_spell') return true
  const def = skillId !== null ? SKILLS[skillId] : undefined
  if (def !== undefined && (def.damageType === 'magic' || def.baseMult === 0)) return true
  return unitClass === 'mage'
}

/** What the scene knows about one hero on this frame. */
export interface PoseCue {
  dead: boolean
  /** Its death moment is playing (the fall is animated from the flinch). */
  falling: boolean
  /** It strikes or casts in this beat. */
  acting: boolean
  /** The skill it acts with (null for none). */
  skillId: string | null
  unitClass: HeroClass | null
  /** A blow of this beat lands on it. */
  hurt: boolean
  /** It is braced: the Master's Guard (or a guard of its own) is up, or a blow was turned. */
  guarded: boolean
  /** The fight is over and won. */
  won: boolean
}

export function heroPoseFor(c: PoseCue): HeroPose {
  if (c.dead) return c.falling ? 'hurt' : 'ko'
  if (c.won) return 'victory'
  if (c.acting) {
    if (c.skillId === BRACE) return 'guard'
    return castsSkill(c.skillId, c.unitClass) ? 'cast' : 'attack'
  }
  if (c.hurt) return 'hurt'
  if (c.guarded) return 'guard'
  return 'idle'
}

/**
 * Whether a unit stands braced on this frame: a `guard-up` status on it (the Master's Guard,
 * a Shield Wall), or a blow of this beat turned aside on it.
 */
export function isGuarded(marks: readonly StatusMark[], beat: readonly CombatEvent[], unitId: string): boolean {
  return marks.some((m) => m.key === 'guard-up') || beat.some((e) => e.kind === 'guard' && e.targetId === unitId)
}
