/**
 * What a skill does, in words (lane F): built from the skill's own data at the hero's
 * level, so the text never drifts from the engine — the blow (how many hits, on whom, how
 * hard), each effect (heals, shields, taunts, buffs, debuffs, DoTs, stuns, SP), and the
 * costs. Pure; the skill list and the Training Center show it.
 */
import type { BuffStat, DotKind, ResolvedEffect, SkillDef, SkillTarget } from '../engine/types'
import { effectAt, hpCostAt, passiveMagnitude, skillMultAt } from '../engine/skills'
import { t } from './i18n/i18n'

/** The role a skill plays, for its tag in the list. */
export type SkillRole = 'strike' | 'sweep' | 'tank' | 'heal' | 'support' | 'control' | 'passive'

const pctOf = (x: number) => Math.round(x * 100)
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
const mult = (x: number) => `×${x.toFixed(2)}`

function statWord(stat: BuffStat): string {
  switch (stat) {
    case 'atk':
      return t('attack')
    case 'def':
      return t('defence')
    case 'spd':
      return t('speed')
    case 'crit':
      return t('crit')
    case 'guard':
      return t('damage taken')
  }
}

function dotWord(dot: DotKind | 'element'): string {
  return dot === 'bleed' ? t('bleed') : dot === 'poison' ? t('poison') : dot === 'burn' ? t('burn') : t('its element (burn, poison or bleed)')
}

function turns(n: number): string {
  return n === 1 ? t('1 turn') : t('{n} turns', { n })
}

/** Who a skill strikes or tends, in a few words. */
function targetWords(target: SkillTarget): string {
  switch (target) {
    case 'single':
      return t('one foe')
    case 'all-enemies':
      return t('every foe')
    case 'front-row':
      return t('the front line')
    case 'cleave':
      return t('a foe and the one beside it')
    case 'self':
      return t('the caster')
    case 'ally-lowest':
      return t('the most wounded ally')
    case 'ally-threatened':
      return t('the ally under attack')
    case 'all-allies':
      return t('the whole party')
  }
}

/** Who one effect lands on. */
function toWords(def: SkillDef, e: ResolvedEffect): string {
  switch (e.to ?? 'targets') {
    case 'self':
      return t('the caster')
    case 'allies':
      return t('the whole party')
    case 'ally-lowest':
      return t('the most wounded ally')
    case 'targets':
      return targetWords(def.target)
  }
}

function chanceWords(c: number | undefined): string {
  return c !== undefined && c < 100 ? t('{n}% chance: ', { n: c }) : ''
}

/** One effect in words. */
export function effectText(def: SkillDef, e: ResolvedEffect): string {
  const who = toWords(def, e)
  switch (e.kind) {
    case 'heal':
      return e.from === 'mAtk'
        ? t('heals {who} for {n}% of M.ATK', { who, n: e.pct })
        : t('heals {who} for {n}% of max HP', { who, n: e.pct })
    case 'regen':
      return e.from === 'mAtk'
        ? t('{who} regenerates {n}% of M.ATK a turn for {turns}', { who, n: e.pct, turns: turns(e.turns) })
        : t('{who} regenerates {n}% of max HP a turn for {turns}', { who, n: e.pct, turns: turns(e.turns) })
    case 'shield': {
      const base = e.from === 'mAtk' ? t('M.ATK') : e.from === 'def' ? t('P.DEF') : t('max HP')
      return t('shields {who} for {n}% of {base} ({turns})', { who, n: e.pct, base, turns: turns(e.turns) })
    }
    case 'buff':
      if (e.stat === 'guard') return t('{who} takes {n}% less damage for {turns}', { who, n: e.pct, turns: turns(e.turns) })
      if (e.stat === 'crit') return t('{who}: +{n} crit for {turns}', { who, n: e.pct, turns: turns(e.turns) })
      return t('{who}: {stat} +{n}% for {turns}', { who, stat: statWord(e.stat), n: e.pct, turns: turns(e.turns) })
    case 'debuff': {
      const c = chanceWords(e.chance)
      if (e.stat === 'guard') return c + t('marks {who}: +{n}% damage taken for {turns}', { who, n: e.pct, turns: turns(e.turns) })
      if (e.stat === 'crit') return c + t('{who}: −{n} crit for {turns}', { who, n: e.pct, turns: turns(e.turns) })
      return c + t('{who}: {stat} −{n}% for {turns}', { who, stat: statWord(e.stat), n: e.pct, turns: turns(e.turns) })
    }
    case 'dot': {
      const c = chanceWords(e.chance)
      if ((e.to ?? 'targets') === 'self') return t('the caster bleeds {n}% of max HP a turn for {turns}', { n: e.pct, turns: turns(e.turns) })
      return e.from === 'maxHP'
        ? c + t('{dot}: {n}% of max HP a turn for {turns}', { dot: dotWord(e.dot), n: e.pct, turns: turns(e.turns) })
        : c + t('{dot}: {n}% of attack a turn for {turns}', { dot: dotWord(e.dot), n: e.pct, turns: turns(e.turns) })
    }
    case 'stun':
      return chanceWords(e.chance) + t('staggers the foe (its turn comes {n}% later)', { n: e.push })
    case 'taunt':
      return t('taunts: foes must strike {who} for {turns}', { who, turns: turns(e.turns) })
    case 'sp':
      return e.amount > 0 ? t('gives {who} {n} SP', { who, n: e.amount }) : t('drains {n} SP from {who}', { who, n: -e.amount })
  }
}

/** The blow, in words (null for a support skill or a passive). */
function blowText(def: SkillDef, level: number): string | null {
  if (def.passive !== undefined || def.baseMult <= 0) return null
  const m = skillMultAt(def, level)
  const kind = def.damageType === 'magic' ? t('magic') : t('physical')
  const hits = def.hits ?? 1
  if (hits > 1) return t('{hits} hits on {who} ({m} each, {kind})', { hits, who: targetWords(def.target), m: mult(m), kind })
  if (def.target === 'cleave') return t('strikes a foe ({m}) and the one beside it (half), {kind}', { m: mult(m), kind })
  if (def.target === 'all-enemies' || def.target === 'front-row') {
    return t('strikes {who} ({m}, spread over them), {kind}', { who: targetWords(def.target), m: mult(m), kind })
  }
  return t('strikes {who} ({m}, {kind})', { who: targetWords(def.target), m: mult(m), kind })
}

function passiveText(def: SkillDef, level: number): string {
  const p = def.passive!
  const m = passiveMagnitude(def, level)
  if (p.kind === 'guard') {
    if (p.vs === undefined) return t('takes {n}% less damage, always', { n: pctOf(m) })
    if (p.vs === 'ranged') return t('takes {n}% less from archers and mages, always', { n: pctOf(m) })
    return t('takes {n}% less {element} damage, always', { n: pctOf(m), element: t(cap(p.vs)) })
  }
  if (p.kind === 'bane') return t('+{n}% damage against {family}, always', { n: pctOf(m), family: t(cap(p.family)) })
  const stat = p.stat === 'critPct' ? t('crit') : p.stat === 'spd' ? t('speed') : p.stat === 'maxHP' ? t('max HP') : t(p.stat)
  return t('{stat} +{n}%, always', { stat, n: pctOf(m) })
}

/** Everything a skill does at `level`, as short phrases (blow, effects, costs). */
export function skillPhrases(def: SkillDef, level: number): string[] {
  if (def.passive !== undefined) return [passiveText(def, level)]
  const out: string[] = []
  const blow = blowText(def, level)
  if (blow !== null) out.push(blow)
  for (const e of def.effects ?? []) out.push(effectText(def, effectAt(e, def, level)))
  const hp = hpCostAt(def, level)
  out.push(hp > 0 ? t('{sp} SP · {hp} HP', { sp: def.spCost, hp }) : t('{sp} SP', { sp: def.spCost }))
  return out
}

/** The whole description on one line (a tooltip, a drill row). */
export function skillBlurb(def: SkillDef, level: number): string {
  const [first, ...rest] = skillPhrases(def, level)
  const line = [first, ...rest].join(' · ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}

/** The role a skill plays (its tag in the list). */
export function skillRole(def: SkillDef): SkillRole {
  if (def.passive !== undefined) return 'passive'
  const fx = def.effects ?? []
  if (fx.some((e) => e.kind === 'heal' || e.kind === 'regen')) return 'heal'
  if (fx.some((e) => e.kind === 'taunt') || (def.target === 'self' && fx.some((e) => e.kind === 'shield'))) return 'tank'
  if (def.baseMult <= 0) return 'support'
  // Control: what the blow leaves on the foe (a stun, a Mark, a DoT) — not a self-frenzy.
  if (fx.some((e) => (e.kind === 'stun' || e.kind === 'debuff' || e.kind === 'dot') && (e.to ?? 'targets') === 'targets')) return 'control'
  return def.target === 'all-enemies' || def.target === 'front-row' ? 'sweep' : 'strike'
}

/** The short tag of a role. */
export function roleLabel(role: SkillRole): string {
  switch (role) {
    case 'strike':
      return t('STRIKE')
    case 'sweep':
      return t('SWEEP')
    case 'tank':
      return t('TANK')
    case 'heal':
      return t('HEAL')
    case 'support':
      return t('SUPPORT')
    case 'control':
      return t('CONTROL')
    case 'passive':
      return t('PASSIVE')
  }
}
