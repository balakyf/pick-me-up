/**
 * Skill VFX (lane I), pure: every skill gets a visual identity — a rune circle under the
 * caster for Arcane Burst, a crescent slash running down the line for Incident, thunder
 * columns for Thunder Volley, motes rising off the healed, a dome over the shielded, a cloud
 * on the poisoned, Halgiraf's breath as a cone of fire… A skill without its own entry gets
 * a sensible profile from what it is (its element, its targets, what it does).
 *
 * `fxOps` turns an effect in flight into pixel rectangles for one instant (t from 0 to 1),
 * so BattleFxCanvas only fills them. Deterministic: flicker and scatter come from the
 * effect's seed, never from Math.random, so the same beat always draws the same.
 */
import type { CombatEvent, Element, SkillDef } from '../../engine/types'
import { SKILLS } from '../../engine/content'
import { SPARK_COLORS } from './battleFx'

export type FxShape =
  | 'rune'
  | 'slash'
  | 'sweep'
  | 'thrust'
  | 'flurry'
  | 'columns'
  | 'motes'
  | 'dome'
  | 'cloud'
  | 'flames'
  | 'cone'
  | 'pillar'
  | 'rain'
  | 'quake'
  | 'wave'
  | 'void'
  | 'aura-up'
  | 'aura-down'
  | 'stars'
  | 'chains'
  | 'bite'
  | 'impact'
  | 'portal'
  | 'pages'

export interface FxProfile {
  shape: FxShape
  /** Palette, brightest first. */
  colors: readonly string[]
  /** How long it plays at 1× (ms). */
  ms: number
  /** Scale of the shape (1 = a hero's size). */
  size: number
  /** A brief full-stage flash at its peak (skipped when flashes are off). */
  flash?: string
}

const HEAL = ['#ffffff', '#c8ffd8', '#7ae0a0', '#3a9a5a']
const SHIELD = ['#ffffff', '#cfe8ff', '#7ab8ff', '#3a6ac8']
const POISON = ['#e8ffc0', '#a8e05a', '#7a3a9a', '#4a1a5a']
const BURN = ['#fff6c0', '#ffb040', '#ff6b4a', '#b8321e']
const BLEED = ['#ffd0d0', '#ff5a5a', '#b81e2e', '#5a0a14']
const BUFF = ['#fffbd0', '#ffe07a', '#ffb040', '#c87a1e']
const DEBUFF = ['#e0d0ff', '#9a7ad8', '#5a3a9a', '#2a1a4a']
const STEELC = ['#ffffff', '#eef0f4', '#cfd3da', '#8e94aa']
const VOID = ['#ffd0ff', '#ff3aff', '#7a1a9a', '#1a0a2a']
const GOLDC = ['#ffffff', '#fffbd0', '#ffe07a', '#d4a02a']

/** Hand-picked identities, by skill id (heroes' and lane G's foes'). */
export const SKILL_FX: Record<string, Omit<FxProfile, 'colors'> & { colors?: readonly string[] }> = {
  // heroes
  power_strike: { shape: 'impact', ms: 560, size: 1.2 },
  piercing_thrust: { shape: 'thrust', ms: 600, size: 1 },
  shadow_flurry: { shape: 'flurry', ms: 760, size: 1, colors: ['#ffffff', '#b8b0d8', '#5a4a8a', '#1e1a3a'] },
  thunder_volley: { shape: 'columns', ms: 820, size: 1, colors: ['#ffffff', '#e0ffff', '#7af0ff', '#2a8aa0'], flash: '#e0ffff' },
  arcane_burst: { shape: 'rune', ms: 900, size: 1.2, colors: ['#ffffff', '#e0c8ff', '#9a5ad0', '#4a1a8a'] },
  basic_swordsmanship: { shape: 'flurry', ms: 600, size: 0.9, colors: STEELC },
  intermediate_sword: { shape: 'flurry', ms: 640, size: 1, colors: STEELC },
  basic_shield: { shape: 'dome', ms: 760, size: 1, colors: SHIELD },
  berserk: { shape: 'aura-up', ms: 760, size: 1.1, colors: BLEED },
  composure: { shape: 'aura-up', ms: 700, size: 1, colors: ['#ffffff', '#cfe8ff', '#9ad4ff', '#4a7ad8'] },
  calmness: { shape: 'dome', ms: 700, size: 0.9, colors: ['#ffffff', '#d8ffe8', '#9ae0c0', '#4a8a6a'] },
  sword_soul: { shape: 'slash', ms: 640, size: 1.3, colors: ['#ffffff', '#d8deee', '#9aa8d0', '#4a5a8a'] },
  ganggyeok: { shape: 'impact', ms: 640, size: 1.3, colors: ['#ffffff', '#fff0c0', '#f0d48a', '#7a5a1e'] },
  siman: { shape: 'slash', ms: 660, size: 1.4 },
  incident: { shape: 'sweep', ms: 820, size: 1.3, colors: ['#ffffff', '#fff0d0', '#ffd08a', '#c87a3a'] },
  sword_shield_technique: { shape: 'slash', ms: 640, size: 1.2, colors: SHIELD },
  exceed: { shape: 'slash', ms: 720, size: 1.5, colors: BUFF },
  ixid: { shape: 'thrust', ms: 700, size: 1.5, colors: ['#ffffff', '#ffe0e0', '#ff7a7a', '#a01e2e'] },
  pathology: { shape: 'impact', ms: 760, size: 1.6, colors: ['#ffffff', '#e0d0ff', '#9a7ad8', '#3a1a6a'], flash: '#e0d0ff' },
  first_aid: { shape: 'motes', ms: 760, size: 1, colors: HEAL },
  regeneration: { shape: 'motes', ms: 900, size: 0.9, colors: HEAL },
  indomitability: { shape: 'dome', ms: 760, size: 1.1, colors: SHIELD },
  war_cry: { shape: 'aura-up', ms: 760, size: 1, colors: BUFF },
  hunters_mark: { shape: 'aura-down', ms: 640, size: 0.9, colors: ['#ffffff', '#ffd0a0', '#ff7a3a', '#a03a1e'] },
  stealthy_movements: { shape: 'aura-up', ms: 640, size: 0.9, colors: ['#e0e0ff', '#a0a0d0', '#5a5a8a', '#2a2a4a'] },
  spellbind: { shape: 'chains', ms: 760, size: 1, colors: ['#ffffff', '#e0c8ff', '#9a5ad0', '#4a1a8a'] },
  barrier: { shape: 'dome', ms: 820, size: 1.1, colors: ['#ffffff', '#e0f0ff', '#9ad4ff', '#4a7ad8'] },
  mending_light: { shape: 'pillar', ms: 900, size: 1, colors: ['#ffffff', '#fffbd0', '#c8ffd8', '#7ae0a0'] },
  field_medicine: { shape: 'motes', ms: 820, size: 1, colors: HEAL },
  unyielding: { shape: 'dome', ms: 820, size: 1.2, colors: ['#ffffff', '#ffe8c0', '#f0b860', '#a8701e'] },
  // foes (lane G)
  e_dragon_breath: { shape: 'cone', ms: 1000, size: 1.4, colors: BURN, flash: '#ffd0a0' },
  e_inferno: { shape: 'cone', ms: 1000, size: 1.5, colors: BURN, flash: '#ffd0a0' },
  e_chimera_fire: { shape: 'cone', ms: 900, size: 1.1, colors: BURN },
  e_tail_sweep: { shape: 'sweep', ms: 760, size: 1.2, colors: ['#ffffff', '#c8c0e0', '#6a5a8a', '#2e2240'] },
  e_sky_dive: { shape: 'impact', ms: 820, size: 1.8, colors: ['#ffffff', '#d8c8ff', '#7a5ad0', '#2e2240'], flash: '#ffffff' },
  e_dark_prayer: { shape: 'motes', ms: 760, size: 1, colors: ['#f0e0ff', '#c8a0ff', '#7a3aa0', '#3a1a5a'] },
  e_black_rite: { shape: 'void', ms: 1000, size: 1.3, colors: ['#ffd0e0', '#ff5a7a', '#6a1424', '#1a0a14'], flash: '#ffb0c0' },
  e_curse: { shape: 'aura-down', ms: 700, size: 1, colors: DEBUFF },
  e_saints_grace: { shape: 'pillar', ms: 820, size: 0.9, colors: ['#ffffff', '#fffbd0', '#ffe07a', '#d4a02a'] },
  e_sanctuary: { shape: 'dome', ms: 860, size: 1.1, colors: GOLDC },
  e_holy_light: { shape: 'pillar', ms: 760, size: 1, colors: GOLDC },
  e_judgment_flare: { shape: 'pillar', ms: 900, size: 1, colors: GOLDC, flash: '#fffbd0' },
  e_chains_of_faith: { shape: 'chains', ms: 760, size: 1, colors: GOLDC },
  e_purge: { shape: 'pillar', ms: 700, size: 0.8, colors: GOLDC },
  e_venom_spit: { shape: 'cloud', ms: 820, size: 1, colors: POISON },
  e_brood_bite: { shape: 'bite', ms: 600, size: 1, colors: POISON },
  e_dragon_bite: { shape: 'bite', ms: 640, size: 1.3, colors: BLEED },
  e_frenzied_bite: { shape: 'bite', ms: 600, size: 1, colors: BLEED },
  e_rend: { shape: 'bite', ms: 560, size: 0.9, colors: BLEED },
  e_three_heads: { shape: 'bite', ms: 720, size: 1.2, colors: BURN },
  e_ground_slam: { shape: 'quake', ms: 820, size: 1.1 },
  e_titan_fist: { shape: 'quake', ms: 900, size: 1.4, flash: '#ffd0a0' },
  e_colossal_slam: { shape: 'quake', ms: 1000, size: 1.6, colors: ['#ffffff', '#d8c8ff', '#8a7ae0', '#2a1e4a'], flash: '#e0d8ff' },
  e_crushing_blow: { shape: 'impact', ms: 860, size: 1.7, flash: '#ffffff' },
  e_crushing_leap: { shape: 'quake', ms: 860, size: 1.3 },
  e_tidal_wave: { shape: 'wave', ms: 1000, size: 1.4, colors: ['#ffffff', '#cfe8ff', '#4aa3ff', '#123a8e'] },
  e_ink_spray: { shape: 'wave', ms: 820, size: 1, colors: ['#8a8aa0', '#3a3a5a', '#1a1a2e', '#06060c'] },
  e_water_veil: { shape: 'dome', ms: 820, size: 1.3, colors: ['#ffffff', '#cfe8ff', '#4aa3ff', '#123a8e'] },
  e_thunderclap: { shape: 'columns', ms: 820, size: 1, colors: ['#ffffff', '#e0ffff', '#7af0ff', '#2a8aa0'], flash: '#e0ffff' },
  e_lightning_step: { shape: 'flurry', ms: 700, size: 1, colors: ['#ffffff', '#e0ffff', '#7af0ff', '#2a8aa0'] },
  e_flicker_strikes: { shape: 'flurry', ms: 760, size: 1, colors: ['#ffffff', '#d0ffe0', '#4fcf8a', '#1a6e3e'] },
  e_iron_blood: { shape: 'aura-up', ms: 760, size: 1.4, colors: BLEED },
  e_iron_cleave: { shape: 'sweep', ms: 760, size: 1.3, colors: BURN },
  e_iron_verdict: { shape: 'rain', ms: 1000, size: 1.3, colors: BURN, flash: '#ffd0a0' },
  e_war_roar: { shape: 'aura-up', ms: 760, size: 1.2, colors: BLEED },
  e_destruction: { shape: 'quake', ms: 1000, size: 1.6, colors: ['#ffffff', '#e0c8ff', '#7a3aa0', '#1a0a2a'], flash: '#e0c8ff' },
  e_armor_crush: { shape: 'impact', ms: 700, size: 1.4, colors: DEBUFF },
  e_ranker_slash: { shape: 'slash', ms: 700, size: 1.6, colors: GOLDC },
  e_sword_rain: { shape: 'rain', ms: 1000, size: 1.3, colors: ['#ffffff', '#fffbd0', '#d8deee', '#7a84a8'], flash: '#ffffff' },
  e_counter_stance: { shape: 'dome', ms: 700, size: 1.3, colors: GOLDC },
  e_ragna_blade: { shape: 'slash', ms: 760, size: 1.6, colors: ['#ffd0d0', '#ff5a5a', '#8a1a2a', '#1a0a14'] },
  e_dark_dominion: { shape: 'void', ms: 1100, size: 1.5, colors: ['#ffd0d0', '#ff5a5a', '#5a0a1a', '#0a0408'], flash: '#ffb0b0' },
  e_commanders_will: { shape: 'aura-up', ms: 760, size: 1.2, colors: ['#ffd0d0', '#ff7a6a', '#8a1a2a', '#3a0a14'] },
  e_null_wave: { shape: 'void', ms: 900, size: 1.1, colors: ['#e8e0ff', '#c8b8ff', '#5a4a9a', '#140e24'] },
  e_fragment_storm: { shape: 'rain', ms: 900, size: 1, colors: ['#ffffff', '#c8b8ff', '#8a7ae0', '#2a1e4a'] },
  e_shard_burst: { shape: 'impact', ms: 640, size: 1, colors: ['#ffffff', '#c8b8ff', '#8a7ae0', '#2a1e4a'] },
  e_end_of_days: { shape: 'void', ms: 1200, size: 1.7, colors: VOID, flash: '#ffd0ff' },
  e_call_the_void: { shape: 'portal', ms: 1000, size: 1.4, colors: VOID },
  e_void_touch: { shape: 'impact', ms: 600, size: 1, colors: VOID },
  e_doom_mark: { shape: 'aura-down', ms: 800, size: 1, colors: VOID },
  e_hatch: { shape: 'portal', ms: 900, size: 1.2, colors: ['#ffd0c0', '#ff5a3a', '#6a2e4e', '#2a0e1a'] },
  e_architects_decree: { shape: 'pillar', ms: 860, size: 1.2, colors: GOLDC, flash: '#fffbd0' },
  e_rewrite: { shape: 'pages', ms: 900, size: 1, colors: ['#ffffff', '#f4ecd8', '#ffe07a', '#6a5a48'] },
  e_final_draft: { shape: 'pages', ms: 1200, size: 1.6, colors: ['#ffffff', '#f4ecd8', '#ffe07a', '#d4a02a'], flash: '#ffffff' },
  e_arcane_storm: { shape: 'rune', ms: 1000, size: 1.4, colors: ['#ffffff', '#c8c0ff', '#7a5ad0', '#2a1a5a'], flash: '#e0d8ff' },
  e_truth_lance: { shape: 'thrust', ms: 700, size: 1.2, colors: ['#ffffff', '#e0d8ff', '#7af0ff', '#2a5a8a'] },
  e_mind_rend: { shape: 'aura-down', ms: 700, size: 1, colors: DEBUFF },
  e_shriek: { shape: 'wave', ms: 700, size: 0.8, colors: ['#ffffff', '#e0c8ff', '#9a7ac0', '#4a3a6a'] },
  e_wail: { shape: 'wave', ms: 760, size: 0.9, colors: ['#e8f0ff', '#8a80b8', '#4a4270', '#1a1630'] },
  e_shield_wall: { shape: 'dome', ms: 700, size: 1.1, colors: SHIELD },
  e_guardian_shell: { shape: 'dome', ms: 760, size: 1.3, colors: SHIELD },
  e_core_ward: { shape: 'dome', ms: 760, size: 1, colors: GOLDC },
  e_constrict: { shape: 'chains', ms: 760, size: 1.2, colors: ['#ffd0ff', '#b05aa0', '#6a2e6a', '#2a0e2a'] },
  e_mud_bind: { shape: 'chains', ms: 700, size: 1, colors: ['#f0d48a', '#a8803e', '#5e4a30', '#2a1a0a'] },
  e_xyz_barrage: { shape: 'flurry', ms: 700, size: 1, colors: ['#ffffff', '#f0d48a', '#c8a24a', '#7a5a1e'] },
  e_aimed_shot: { shape: 'thrust', ms: 640, size: 1, colors: BURN },
}

const TARGETS_MANY = new Set(['all-enemies', 'all-allies', 'cleave', 'front-row'])

/** A profile from what a skill is, for one without its own entry (lane J's new ones too). */
export function defaultFx(def: Pick<SkillDef, 'element' | 'damageType' | 'target' | 'baseMult' | 'hits' | 'effects'>, element: Element): FxProfile {
  const el = def.element ?? element
  const sparks = SPARK_COLORS[el]
  const kinds = new Set((def.effects ?? []).map((e) => e.kind))
  const dot = (def.effects ?? []).find((e) => e.kind === 'dot')
  if (def.baseMult === 0) {
    if (kinds.has('heal') || kinds.has('regen')) return { shape: 'motes', colors: HEAL, ms: 760, size: 1 }
    if (kinds.has('shield') || kinds.has('taunt')) return { shape: 'dome', colors: SHIELD, ms: 760, size: 1 }
    if (kinds.has('summon')) return { shape: 'portal', colors: sparks, ms: 900, size: 1.2 }
    if (kinds.has('buff')) return { shape: 'aura-up', colors: BUFF, ms: 700, size: 1 }
    return { shape: 'aura-down', colors: DEBUFF, ms: 700, size: 1 }
  }
  if (dot && dot.kind === 'dot') {
    const k = dot.dot === 'element' ? (el === 'fire' || el === 'light' ? 'burn' : el === 'wind' || el === 'physical' ? 'bleed' : 'poison') : dot.dot
    if (k === 'poison') return { shape: 'cloud', colors: POISON, ms: 800, size: 1 }
    if (k === 'burn') return { shape: 'flames', colors: BURN, ms: 800, size: 1 }
  }
  if (kinds.has('stun')) return { shape: 'stars', colors: ['#ffffff', '#fff0a0', '#ffd24a', '#a8801a'], ms: 760, size: 1 }
  if ((def.hits ?? 1) > 1) return { shape: 'flurry', colors: sparks, ms: 700, size: 1 }
  const many = TARGETS_MANY.has(def.target)
  if (def.damageType === 'magic') {
    if (many) return el === 'dark' ? { shape: 'void', colors: sparks, ms: 900, size: 1.1 } : { shape: 'rune', colors: sparks, ms: 900, size: 1.1 }
    return el === 'light' ? { shape: 'pillar', colors: sparks, ms: 700, size: 0.9 } : { shape: 'impact', colors: sparks, ms: 600, size: 1 }
  }
  if (def.target === 'cleave') return { shape: 'thrust', colors: sparks, ms: 600, size: 1 }
  if (many) return { shape: 'sweep', colors: sparks, ms: 760, size: 1.1 }
  return { shape: 'slash', colors: sparks, ms: 600, size: 1 }
}

/**
 * The profile a cast plays: the skill's own, else one built from what it is. Null for a
 * plain attack, a caster foe's basic Spell, a brace or an unknown id (lane E's sparks are
 * enough there).
 */
export function skillFx(skillId: string, element: Element): FxProfile | null {
  const def = SKILLS[skillId]
  if (!def || def.passive) return null
  const own = SKILL_FX[skillId]
  const base = defaultFx(def, element)
  if (!own) return base
  return { ...base, ...own, colors: own.colors ?? SPARK_COLORS[def.element ?? element] }
}

// ── Drawing ──────────────────────────────────────────────────────────────────

/** One filled rectangle of logical pixels. */
export interface FxOp {
  x: number
  y: number
  w: number
  h: number
  color: string
  alpha: number
}

export interface FxPoint {
  x: number
  /** The unit's feet. */
  y: number
  /** The unit's height (the shape scales to the body it lands on). */
  h: number
}

/** An effect in flight: what it is, from whom, onto whom. */
export interface FxCast {
  profile: FxProfile
  caster: FxPoint
  targets: FxPoint[]
  /** +1 when the caster faces right (a foe), −1 when it faces left (a hero). */
  dir: 1 | -1
  seed: number
}

/** A tiny integer hash → [0, 1), for scatter and flicker that never change between frames. */
function h01(a: number, b: number, c = 0): number {
  let x = (a * 374761393 + b * 668265263 + c * 2147483647) | 0
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
/** 0 → 1 → 0 over the effect, with a quick rise. */
const env = (t: number, rise = 0.15, fall = 0.35) => (t < rise ? t / rise : t > 1 - fall ? clamp01((1 - t) / fall) : 1)

/**
 * The pixels of `c` at instant `t` (0 → 1). The whole effect is a pure function of the
 * cast and the instant; the canvas draws whatever comes back.
 */
export function fxOps(c: FxCast, t: number): FxOp[] {
  const ops: FxOp[] = []
  const p = c.profile
  const col = (i: number) => p.colors[Math.min(p.colors.length - 1, Math.max(0, i))]!
  const px = (x: number, y: number, ci: number, a = 1, w = 1, h = 1) => {
    if (a > 0.02) ops.push({ x: Math.round(x), y: Math.round(y), w, h, color: col(ci), alpha: Math.min(1, a) })
  }
  const s = p.size
  const e = env(t)
  const flick = (i: number, k: number) => h01(c.seed, i, Math.floor(t * k)) // stable within a short window
  const targets = c.targets.length > 0 ? c.targets : [c.caster]
  const stagger = (i: number) => clamp01((t - i * 0.06) / Math.max(0.2, 1 - i * 0.06))

  switch (p.shape) {
    case 'rune': {
      // A ring of runes turning under the caster, and the same sigil blooming on each target.
      const ring = (cx: number, cy: number, r: number, k: number, a: number) => {
        const n = Math.round(10 + r)
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + t * 3 * (k % 2 ? -1 : 1)
          px(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.36, i % 4 === 0 ? 0 : 2, a, i % 4 === 0 ? 2 : 1)
        }
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 - t * 2
          px(cx + Math.cos(ang) * r * 0.6, cy + Math.sin(ang) * r * 0.22, 1, a)
        }
      }
      ring(c.caster.x, c.caster.y - 1, 17 * s * (0.6 + 0.4 * e), 0, e)
      for (let i = 0; i < 6; i++) px(c.caster.x + (h01(c.seed, i) - 0.5) * 20 * s, c.caster.y - 4 - t * 30 * h01(c.seed, i, 9), 1, e * 0.9)
      targets.forEach((tg, k) => {
        const tt = clamp01((t - 0.35) / 0.65)
        if (tt <= 0) return
        ring(tg.x, tg.y - tg.h / 2, (6 + tt * 12) * s, k + 1, env(tt, 0.1, 0.5))
        if (tt < 0.25) px(tg.x - 3, tg.y - tg.h / 2 - 3, 0, 1 - tt * 4, 7, 7)
      })
      break
    }
    case 'slash':
    case 'sweep': {
      // A crescent cut across each target; a sweep runs it down the line one after another.
      targets.forEach((tg, k) => {
        const tt = p.shape === 'sweep' ? stagger(k) : t
        if (tt <= 0) return
        const r = (tg.h * 0.5 + 4) * s
        const cx = tg.x
        const cy = tg.y - tg.h * 0.5
        const head = Math.min(1, tt * 2.2)
        const a = env(tt, 0.05, 0.5)
        for (let i = 0; i < 18; i++) {
          const f = i / 17
          if (f > head) break
          const ang = -2.3 + f * 2.6
          const thick = Math.sin(f * Math.PI) * 2.6 * s + 1
          const x = cx + Math.cos(ang) * r * -c.dir
          const y = cy + Math.sin(ang) * r
          px(x, y, f > head - 0.15 ? 0 : 1, a, Math.max(1, Math.round(thick)), 1)
          px(x + c.dir, y + 1, 2, a * 0.7)
        }
      })
      break
    }
    case 'thrust': {
      // A streak driven straight through the targets.
      const y0 = c.caster.y - c.caster.h * 0.55
      const far = targets.reduce((m, tg) => (Math.abs(tg.x - c.caster.x) > Math.abs(m - c.caster.x) ? tg.x : m), targets[0]!.x)
      const end = far + c.dir * 18 * s
      const head = c.caster.x + (end - c.caster.x) * Math.min(1, t * 1.8)
      const a = env(t, 0.05, 0.45)
      const from = Math.min(c.caster.x, head)
      const to = Math.max(c.caster.x, head)
      for (let x = from; x <= to; x += 2) {
        const f = Math.abs(x - c.caster.x) / Math.max(1, Math.abs(end - c.caster.x))
        px(x, y0, f > 0.85 ? 0 : 1, a * (0.4 + f * 0.6), 2, 1)
        if (h01(c.seed, Math.round(x)) > 0.7) px(x, y0 + (h01(c.seed, Math.round(x), 2) > 0.5 ? -2 : 2), 2, a * 0.6)
      }
      px(head - 2, y0 - 2, 0, a, 4, 5)
      break
    }
    case 'flurry': {
      // Quick cuts landing one after another: little crosses all over the target.
      targets.forEach((tg, k) => {
        for (let i = 0; i < 5; i++) {
          const at = 0.08 + i * 0.16
          const tt = (t - at) / 0.22
          if (tt < 0 || tt > 1) continue
          const x = tg.x + (h01(c.seed, i, k) - 0.5) * 14 * s
          const y = tg.y - tg.h * (0.3 + h01(c.seed, i + 9, k) * 0.45)
          const len = 3 + Math.round(5 * s * Math.min(1, tt * 3))
          const a = 1 - tt
          for (let j = -len; j <= len; j++) {
            px(x + j, y + j * (i % 2 ? 1 : -1), Math.abs(j) < 2 ? 0 : 1, a, 2, 1)
          }
        }
      })
      break
    }
    case 'columns': {
      // Thunder: jagged bolts from the sky onto every target, and the ground flaring.
      targets.forEach((tg, k) => {
        const tt = stagger(k)
        if (tt <= 0) return
        const on = flick(k, 22) > 0.25
        const a = env(tt, 0.05, 0.5)
        if (on) {
          let x = tg.x
          const top = 0
          const bottom = tg.y - 2
          for (let y = top; y < bottom; y += 3) {
            const nx = tg.x + (h01(c.seed, y, k + Math.floor(t * 8)) - 0.5) * 8 * s
            for (let j = 0; j < 3; j++) px(x + ((nx - x) * j) / 3, y + j, j === 1 ? 0 : 1, a, 2, 1)
            x = nx
          }
        }
        for (let i = -8; i <= 8; i += 2) px(tg.x + i * s, tg.y - 1, Math.abs(i) < 4 ? 0 : 2, a * (1 - Math.abs(i) / 10), 2, 1)
      })
      break
    }
    case 'motes': {
      // A soft column of light and motes rising off each body.
      targets.forEach((tg, k) => {
        const a = env(t, 0.15, 0.4)
        // a soft glow at the feet, brighter toward the ground
        for (let i = -7; i <= 7; i += 2) px(tg.x + i, tg.y - 1, 2, a * (0.7 - Math.abs(i) / 14), 2, 1)
        for (let y = 0; y < tg.h * 0.6; y += 3) px(tg.x - 1, tg.y - y, 2, a * 0.25 * (1 - y / (tg.h * 0.6)), 3, 2)
        for (let i = 0; i < 12; i++) {
          const ph = (t * 1.4 + h01(c.seed, i, k)) % 1
          const x = tg.x + (h01(c.seed, i + 20, k) - 0.5) * 18 * s
          const y = tg.y - ph * (tg.h + 14)
          const plus = i % 3 === 0
          px(x, y, i % 2, a * (1 - ph * 0.6))
          if (plus) {
            px(x - 1, y, 1, a * 0.8)
            px(x + 1, y, 1, a * 0.8)
            px(x, y - 1, 1, a * 0.8)
            px(x, y + 1, 1, a * 0.8)
          }
        }
      })
      break
    }
    case 'dome': {
      // A dome of light rising over each body, its panels catching the light.
      targets.forEach((tg) => {
        const rise = Math.min(1, t * 3)
        const a = env(t, 0.1, 0.4)
        const rx = (tg.h * 0.55 + 4) * s
        const ry = (tg.h * 0.8 + 4) * s * rise
        const n = Math.round(24 + rx)
        for (let i = 0; i <= n; i++) {
          const ang = Math.PI + (i / n) * Math.PI
          const x = tg.x + Math.cos(ang) * rx
          const y = tg.y + Math.sin(ang) * ry
          px(x, y, (i + Math.floor(t * 12)) % 6 === 0 ? 0 : 2, a)
        }
        for (let i = 1; i < 4; i++) {
          const ang = Math.PI + (i / 4) * Math.PI
          for (let f = 0.2; f < 1; f += 0.2) px(tg.x + Math.cos(ang) * rx * f, tg.y + Math.sin(ang) * ry * f, 3, a * 0.35)
        }
        for (let i = -Math.round(rx); i <= rx; i += 2) px(tg.x + i, tg.y, 1, a * 0.6)
      })
      break
    }
    case 'cloud':
    case 'flames': {
      // A cloud of venom (or a fire) clinging to each body.
      targets.forEach((tg, k) => {
        const a = env(t, 0.15, 0.4)
        for (let i = 0; i < 16; i++) {
          const ph = (t * (p.shape === 'flames' ? 1.6 : 0.6) + h01(c.seed, i, k)) % 1
          const x = tg.x + (h01(c.seed, i + 40, k) - 0.5) * 20 * s + Math.sin((t + i) * 6) * 2
          const y = p.shape === 'flames' ? tg.y - ph * tg.h * 0.9 : tg.y - tg.h * (0.3 + h01(c.seed, i + 60, k) * 0.6) - ph * 6
          const size = p.shape === 'flames' ? (ph < 0.5 ? 2 : 1) : 2 + (i % 2)
          px(x, y, Math.min(3, Math.floor(ph * 4)), a * (1 - ph * 0.5), size, size)
        }
      })
      break
    }
    case 'cone': {
      // The breath: a cone of fire widening from the caster's mouth across the targets' side.
      const mx = c.caster.x + c.dir * 18
      const my = c.caster.y - c.caster.h * 0.62
      const reach = targets.reduce((m, tg) => Math.max(m, Math.abs(tg.x - mx)), 40) + 16
      const head = Math.min(1, t * 1.8)
      const a = env(t, 0.05, 0.35)
      for (let i = 0; i < 90; i++) {
        const f = h01(c.seed, i) * head
        const spread = f * 0.45 * s
        const x = mx + c.dir * f * reach
        const y = my + (h01(c.seed, i, 3) - 0.5) * 2 * spread * reach + f * 20
        const ph = (h01(c.seed, i, 5) + t * 2) % 1
        px(x, y, Math.min(3, Math.floor(f * 3 + ph)), a * (1 - f * 0.4), f < 0.3 ? 2 : 3, 2)
      }
      break
    }
    case 'pillar': {
      // A column of light from the sky onto each target.
      targets.forEach((tg, k) => {
        const tt = stagger(k)
        if (tt <= 0) return
        const a = env(tt, 0.08, 0.45)
        const w = Math.round((8 + 4 * s) * Math.min(1, tt * 4))
        for (let y = 0; y < tg.y; y += 2) {
          px(tg.x - w / 2, y, 2, a * 0.5, w, 2)
          px(tg.x - w / 4, y, 0, a * 0.7, Math.max(1, Math.round(w / 2)), 2)
        }
        for (let i = 0; i < 6; i++) px(tg.x + (h01(c.seed, i, k) - 0.5) * w * 2, tg.y - ((t * 60 + i * 13) % tg.h), 0, a)
      })
      break
    }
    case 'rain': {
      // Blades (or shards) falling from the sky onto the line.
      targets.forEach((tg, k) => {
        for (let i = 0; i < 5; i++) {
          const at = 0.05 + i * 0.12 + k * 0.03
          const tt = (t - at) / 0.35
          if (tt < 0 || tt > 1.3) continue
          const x = tg.x + (h01(c.seed, i, k) - 0.5) * 16 * s
          const y = Math.min(tg.y - 2, -10 + tt * (tg.y + 10))
          const a = tt > 1 ? 1.3 - tt : 1
          const len = Math.round(12 * s)
          for (let j = 0; j < len; j++) px(x, y - j, j < 3 ? 0 : j < len * 0.7 ? 1 : 2, a * 3, j < len * 0.7 ? 2 : 1, 1)
          px(x - 2, y - Math.round(len * 0.7), 3, a * 3, 6, 1) // the guard
          if (tt > 0.95 && tt < 1.15) px(x - 4, tg.y - 1, 0, 1, 10, 1) // where it bites the floor
        }
      })
      break
    }
    case 'quake': {
      // The ground cracks under the line, dust jumping out of the cracks.
      const a = env(t, 0.05, 0.4)
      targets.forEach((tg, k) => {
        for (let r = 0; r < 4; r++) {
          let x = tg.x
          let y = tg.y
          const ang = (r - 1.5) * 0.9 + (h01(c.seed, r, k) - 0.5)
          const len = 16 * s * Math.min(1, t * 2.5)
          for (let i = 0; i < len; i += 2) {
            x += Math.cos(ang) * 2 + (h01(c.seed, i, r + k) - 0.5) * 2
            y += Math.sin(ang) * 0.4
            px(x, y, i < 6 ? 0 : 1, a, 2, 1)
          }
        }
        // the shock ring along the floor
        const rr = (6 + t * 26) * s
        for (let i = 0; i < 24; i++) {
          const ang = (i / 24) * Math.PI * 2
          px(tg.x + Math.cos(ang) * rr, tg.y + Math.sin(ang) * rr * 0.25, 1, a * (1 - t), 2, 1)
        }
        for (let i = 0; i < 10; i++) {
          const ph = (t * 1.2 + h01(c.seed, i, k + 7)) % 1
          px(tg.x + (h01(c.seed, i + 30, k) - 0.5) * 30 * s, tg.y - ph * 18, ph < 0.3 ? 1 : 2, a * (1 - ph), 2, 2)
        }
      })
      break
    }
    case 'wave': {
      // A breaking wave sweeping over the targets' side.
      const xs = targets.map((tg) => tg.x)
      const lo = Math.min(...xs) - 24
      const hi = Math.max(...xs) + 24
      const ground = Math.max(...targets.map((tg) => tg.y))
      const front = c.dir > 0 ? lo + (hi - lo) * Math.min(1, t * 1.3) : hi - (hi - lo) * Math.min(1, t * 1.3)
      const a = env(t, 0.05, 0.35)
      for (let x = lo; x <= hi; x += 2) {
        const behind = c.dir > 0 ? x <= front : x >= front
        if (!behind) continue
        const near = 1 - Math.min(1, Math.abs(x - front) / 30)
        const height = (10 + near * 22) * s
        for (let y = 0; y < height; y += 2) px(x, ground - y, y > height - 4 ? 0 : y > height * 0.6 ? 1 : 2, a * (0.5 + near * 0.5), 2, 2)
      }
      break
    }
    case 'void': {
      // Dark rings opening from the heart of the targets' side, torn by glitching bars.
      const cx = targets.reduce((m, tg) => m + tg.x, 0) / targets.length
      const cy = targets.reduce((m, tg) => m + tg.y - tg.h / 2, 0) / targets.length
      const a = env(t, 0.1, 0.35)
      for (let k = 0; k < 3; k++) {
        const r = ((t * 1.3 + k / 3) % 1) * 60 * s
        const n = Math.round(16 + r)
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2
          px(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.5, k === 0 ? 1 : 2, a * (1 - r / (60 * s)))
        }
      }
      for (let i = 0; i < 8; i++) {
        if (flick(i, 16) < 0.5) continue
        px(cx + (h01(c.seed, i, Math.floor(t * 16)) - 0.5) * 120, cy + (h01(c.seed, i + 9, Math.floor(t * 16)) - 0.5) * 50, i % 2 ? 0 : 1, a, 10 + (i % 3) * 6, 1)
      }
      px(cx - 4, cy - 4, 3, a * 0.8, 9, 9)
      break
    }
    case 'aura-up':
    case 'aura-down': {
      // Chevrons climbing (a blessing) or sinking (a curse) around each body.
      const up = p.shape === 'aura-up'
      targets.forEach((tg, k) => {
        const a = env(t, 0.1, 0.4)
        for (let i = 0; i < 6; i++) {
          const ph = (t * 1.5 + i / 6 + h01(c.seed, i, k) * 0.2) % 1
          const x = tg.x + ((i % 3) - 1) * 8 * s
          const y = up ? tg.y - ph * (tg.h + 8) : tg.y - tg.h - 6 + ph * (tg.h + 6)
          for (let j = -2; j <= 2; j++) px(x + j, y + (up ? Math.abs(j) : -Math.abs(j)), Math.abs(j) < 1 ? 0 : 1, a * (1 - ph * 0.7))
        }
        for (let i = -6; i <= 6; i += 2) px(tg.x + i, tg.y, 2, a * 0.5, 2, 1)
      })
      break
    }
    case 'stars':
    case 'chains': {
      // A daze: stars wheeling over the head; a bind: links closing round the body.
      targets.forEach((tg, k) => {
        const a = env(t, 0.15, 0.3)
        if (p.shape === 'stars') {
          for (let i = 0; i < 4; i++) {
            const ang = t * 7 + (i / 4) * Math.PI * 2
            const x = tg.x + Math.cos(ang) * 8
            const y = tg.y - tg.h - 3 + Math.sin(ang) * 2.5
            px(x, y, 0, a)
            px(x - 1, y, 1, a)
            px(x + 1, y, 1, a)
            px(x, y - 1, 1, a)
            px(x, y + 1, 1, a)
          }
        } else {
          const tight = Math.min(1, t * 2.5)
          for (let row = 0; row < 3; row++) {
            const y = tg.y - tg.h * (0.25 + row * 0.25)
            const rx = (10 - 4 * tight) * s + 4
            for (let i = 0; i < 10; i++) {
              const ang = (i / 10) * Math.PI * 2 + row
              px(tg.x + Math.cos(ang) * rx, y + Math.sin(ang) * 2, i % 2 ? 1 : 2, a, 2, 1)
            }
          }
          if (k === 0 && t > 0.4 && t < 0.55) px(tg.x - 6, tg.y - tg.h * 0.6, 0, 0.8, 12, 2)
        }
      })
      break
    }
    case 'bite': {
      // Jaws: two rows of fangs snapping shut on the target.
      targets.forEach((tg) => {
        const close = Math.min(1, t * 3)
        const gap = (12 - close * 10) * s
        const cy = tg.y - tg.h * 0.55
        const a = env(t, 0.05, 0.5)
        for (let i = -3; i <= 3; i++) {
          const x = tg.x + i * 3 * s
          px(x, cy - gap / 2 - 3, 0, a, 2, 3)
          px(x + 1, cy + gap / 2, 0, a, 2, 3)
          px(x, cy - gap / 2 - 4, 2, a, 3, 1)
          px(x, cy + gap / 2 + 3, 2, a, 3, 1)
        }
        if (close >= 1 && t < 0.6) px(tg.x - 8 * s, cy - 1, 1, a, Math.round(16 * s), 2)
      })
      break
    }
    case 'impact': {
      // A ring blown outward from the blow, with a hot core.
      targets.forEach((tg, k) => {
        const tt = clamp01((t - 0.15) / 0.85)
        if (tt <= 0) return
        const cx = tg.x
        const cy = tg.y - tg.h * 0.5
        const r = (4 + tt * 18) * s
        const a = env(tt, 0.05, 0.6)
        const n = Math.round(14 + r * 1.5)
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2
          px(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.8, i % 3 ? 1 : 0, a, 2, 1)
        }
        if (tt < 0.3) px(cx - 3 * s, cy - 3 * s, 0, 1 - tt * 3, Math.round(7 * s), Math.round(7 * s))
        for (let i = 0; i < 6; i++) {
          const ang = h01(c.seed, i, k) * Math.PI * 2
          px(cx + Math.cos(ang) * r * 1.3, cy + Math.sin(ang) * r, 2, a * 0.8)
        }
      })
      break
    }
    case 'portal': {
      // A rift opening before the caster.
      const cx = c.caster.x + c.dir * 18
      const cy = c.caster.y - 2
      const open = Math.min(1, t * 2.5)
      const a = env(t, 0.1, 0.35)
      const rx = 14 * s * open
      for (let i = 0; i < 36; i++) {
        const ang = (i / 36) * Math.PI * 2 + t * 4
        px(cx + Math.cos(ang) * rx, cy + Math.sin(ang) * rx * 0.3, i % 3 ? 1 : 0, a, 2, 1)
      }
      px(cx - rx * 0.6, cy - 1, 3, a * 0.9, Math.max(1, Math.round(rx * 1.2)), 3)
      for (let i = 0; i < 8; i++) {
        const ph = (t * 1.5 + h01(c.seed, i)) % 1
        px(cx + (h01(c.seed, i, 2) - 0.5) * rx * 1.6, cy - ph * 30, 1, a * (1 - ph))
      }
      break
    }
    case 'pages': {
      // Pages of the draft whirling round the caster, then raining on the targets.
      const a = env(t, 0.1, 0.35)
      for (let i = 0; i < 8; i++) {
        const ang = t * 6 + (i / 8) * Math.PI * 2
        const x = c.caster.x + Math.cos(ang) * 18 * s
        const y = c.caster.y - c.caster.h * 0.6 + Math.sin(ang) * 8
        px(x, y, 1, a * (1 - t), 4, 5)
        px(x + 1, y + 2, 3, a * (1 - t), 2, 1)
      }
      targets.forEach((tg, k) => {
        for (let i = 0; i < 3; i++) {
          const tt = (t - 0.3 - i * 0.12) / 0.4
          if (tt < 0 || tt > 1.2) continue
          const x = tg.x + (h01(c.seed, i, k) - 0.5) * 18
          const y = Math.min(tg.y - 6, tt * tg.y)
          px(x, y, 1, a, 4, 5)
          px(x + 1, y + 2, 2, a, 2, 1)
          if (tt > 0.9) px(x - 2, y + 4, 0, a, 8, 1)
        }
      })
      break
    }
  }
  return ops
}

/**
 * Everyone a cast reaches: the units its blows, heals, shields and statuses land on in the
 * events after its 'act' (until the next act or a new tick), else the act's own target.
 */
export function castTargets(events: readonly CombatEvent[], actIndex: number): string[] {
  const act = events[actIndex]
  if (!act || act.kind !== 'act') return []
  const out: string[] = []
  const add = (id: string) => {
    if (!out.includes(id)) out.push(id)
  }
  for (let i = actIndex + 1; i < events.length; i++) {
    const e = events[i]!
    if (e.kind === 'act' || e.tick !== act.tick) break
    if (e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard') add(e.targetId)
    else if (e.kind === 'heal' || e.kind === 'shield') add(e.unitId)
    else if (e.kind === 'status' && e.sourceId === act.actorId) add(e.unitId)
  }
  if (out.length === 0) add(act.targetId)
  return out
}

/** Whether (and in what colour) a cast flashes the stage at its peak (`t`); null when not. */
export function fxFlash(p: FxProfile, t: number): string | null {
  if (!p.flash) return null
  return t > 0.32 && t < 0.42 ? p.flash : null
}
