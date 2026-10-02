/**
 * Lane G · the enemy kits as data: every kit and phase skill exists and is an enemy's; every
 * anchor boss fights with two to four abilities; the casters, healers, knights and summoners
 * carry theirs; every phase's summoned group and every summoning skill's group is a reserve
 * of an anchor that fields that boss; charged moves name their wind-up.
 */
import { describe, expect, it } from 'vitest'
import { ANCHORS } from './anchors'
import { ENEMY_TEMPLATES } from './enemyTemplates'
import { SKILLS } from './skills'
import { ENEMY_SKILLS } from './enemySkills'
import type { EnemyTemplate, PhaseKeyword } from '../types'

const phasesOf = (t: EnemyTemplate): PhaseKeyword[] => (t.keywords ?? []).filter((k): k is PhaseKeyword => k.kind === 'phase')
/** Everything a template can do beside its Strike/Spell: its kit and the skills its phases add. */
const abilities = (t: EnemyTemplate): Set<string> => new Set([...(t.kit ?? []), ...phasesOf(t).flatMap((p) => p.skills ?? [])])

describe('enemy kits', () => {
  it('every kit and phase skill is a registered enemy skill', () => {
    for (const t of Object.values(ENEMY_TEMPLATES)) {
      for (const id of abilities(t)) {
        expect(SKILLS[id], `${t.id}: ${id}`).toBeDefined()
        expect(SKILLS[id]!.enemy, `${t.id}: ${id}`).toBe(true)
      }
    }
    for (const [id, def] of Object.entries(ENEMY_SKILLS)) expect(SKILLS[id]).toBe(def)
  })

  it('every anchor boss fights with two to four abilities (phases count)', () => {
    const bosses = ['black_priest', 'halgiraf', 'kurushahr', 'kthat', 'rodvick', 'lazenca', 'valention', 'versace', 'darkan', 'el_cid', 'chimera_matriarch', 'pryos', 'fragment_colossus', 'herald_of_end', 'tell']
    for (const id of bosses) {
      const t = ENEMY_TEMPLATES[id]!
      const n = abilities(t).size + phasesOf(t).length
      expect(n, id).toBeGreaterThanOrEqual(2)
      expect(abilities(t).size, id).toBeLessThanOrEqual(4)
    }
    // The Egg summons; its phase calls the rest.
    expect(abilities(ENEMY_TEMPLATES.the_egg!).has('e_hatch')).toBe(true)
  })

  it('casters sweep, healers heal, knights hold, summoners summon', () => {
    const has = (id: string, pred: (s: (typeof SKILLS)[string]) => boolean) => [...abilities(ENEMY_TEMPLATES[id]!)].some((k) => pred(SKILLS[k]!))
    for (const id of ['order_mage', 'fragment_warden']) expect(has(id, (s) => s.target === 'all-enemies'), id).toBe(true)
    for (const id of ['order_saint', 'lizard_shaman']) expect(has(id, (s) => (s.effects ?? []).some((e) => e.kind === 'heal')), id).toBe(true)
    for (const id of ['knight', 'dark_knight', 'fragment_knight', 'abyss_knight']) expect(has(id, (s) => (s.effects ?? []).some((e) => e.kind === 'taunt')), id).toBe(true)
    for (const id of ['the_egg', 'herald_of_end']) expect(has(id, (s) => (s.effects ?? []).some((e) => e.kind === 'summon')), id).toBe(true)
    // Act V's marksmen open hard; its inquisitors hunt the heroes.
    expect(ENEMY_TEMPLATES.demon_marksman!.keywords?.some((k) => k.kind === 'opener')).toBe(true)
    expect(ENEMY_TEMPLATES.order_inquisitor!.keywords?.some((k) => k.kind === 'bane')).toBe(true)
  })

  it('every filler act gets some variety (a keyword or an ability in each pool band)', () => {
    const flavoured = (id: string) => abilities(ENEMY_TEMPLATES[id]!).size > 0 || (ENEMY_TEMPLATES[id]!.keywords ?? []).length > 0
    for (const id of ['wolf', 'harpy', 'soldier', 'assassin', 'lizardman', 'lizard_rider', 'shark', 'merman', 'order_soldier', 'demon_marksman', 'chimera', 'wraith', 'fragment_shard', 'void_spawn']) {
      expect(flavoured(id), id).toBe(true)
    }
  })

  it('summoned groups are reserves of the anchors that field the summoner', () => {
    for (const a of Object.values(ANCHORS)) {
      const fielded = new Set(a.waves.flat().map((s) => s.templateId))
      for (const tid of fielded) {
        const t = ENEMY_TEMPLATES[tid]!
        const groups = [
          ...phasesOf(t).flatMap((p) => (p.summonWave ? [p.summonWave] : [])),
          ...[...abilities(t)].flatMap((k) => (SKILLS[k]!.effects ?? []).flatMap((e) => (e.kind === 'summon' ? [e.group] : []))),
        ]
        for (const g of groups) {
          expect(a.reserves?.[g], `F${a.floor} ${tid} → ${g}`).toBeDefined()
          for (const spec of a.reserves![g]!) expect(ENEMY_TEMPLATES[spec.templateId], spec.templateId).toBeDefined()
        }
      }
    }
  })

  it('charged moves wind up for a turn, rest on a cooldown and say what is coming', () => {
    const charged = Object.values(ENEMY_SKILLS).filter((s) => s.charge !== undefined)
    expect(charged.length).toBeGreaterThanOrEqual(10)
    for (const s of charged) {
      expect(s.charge!.turns, s.id).toBeGreaterThanOrEqual(1)
      expect(s.cooldown ?? 0, s.id).toBeGreaterThanOrEqual(3)
      expect(s.charge!.line, s.id).toMatch(/\{name\}/)
    }
  })

  it('phases come in order (thresholds strictly falling) and say who they are', () => {
    for (const t of Object.values(ENEMY_TEMPLATES)) {
      const ph = phasesOf(t)
      for (let i = 1; i < ph.length; i++) expect(ph[i]!.atHpPct, t.id).toBeLessThan(ph[i - 1]!.atHpPct)
      for (const p of ph) {
        expect(p.atHpPct, t.id).toBeGreaterThan(0)
        expect(p.atHpPct, t.id).toBeLessThan(100)
        expect(p.title, t.id).toBeTruthy()
        expect(p.line, t.id).toBeTruthy()
      }
    }
    // The authored ones.
    expect(phasesOf(ENEMY_TEMPLATES.tell!)).toHaveLength(3)
    expect(phasesOf(ENEMY_TEMPLATES.pryos!).every((p) => (p.addKeywords ?? []).some((k) => k.kind === 'aegis'))).toBe(true)
    expect(phasesOf(ENEMY_TEMPLATES.valention!)[0]!.summonWave).toBe('officers')
    expect(phasesOf(ENEMY_TEMPLATES.halgiraf!)[0]!.skills).toContain('e_sky_dive')
    expect(phasesOf(ENEMY_TEMPLATES.el_cid!)[0]!.atHpPct).toBe(50)
  })
})
