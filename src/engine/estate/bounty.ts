/**
 * The bounty board (spec 2026-09-30-estate-and-life §1.3): the Master posts a gold-funded
 * job and sends bench heroes on it — not in the party, not busy with anything else. They
 * are away for the job's world-time, then come back with Promotion Stones, Rank Materials,
 * Attribute Stones, XP and sometimes a rare item. A gold → materials conversion that
 * also gives the bench a purpose.
 *
 * PURE and deterministic: a haul is rolled from rngFor(seed, 'bounty', id).
 */
import { nextInt, chance, rngFor, type Rng } from '../rng'
import { applyXp, xpToNext } from '../stats'
import { forgeGrade, itemName, statBlockFor } from '../equipment'
import { attrStoneId } from '../promotion'
import type { Bounty, BountyReport, ChronicleEntry, EquipmentGrade, EquipmentId, EquipmentItem, EquipmentSlot, GameState, HeroId, MaterialId, OwnedHero } from '../types'
import { addMemory, dayOfSlot, slotOf } from '../life/life'
import { BOUNTIES, BOUNTY } from './constants'
import { isBurntOut } from './trauma'
import { TUNING } from '../tuning'

const GRADES: EquipmentGrade[] = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS']

export function onBounty(state: GameState, heroId: HeroId): Bounty | null {
  return (state.estate?.bounties ?? []).find((b) => b.heroIds.includes(heroId)) ?? null
}

/** Why this hero can't take a bounty right now, or null. */
export function benchRefusal(state: GameState, heroId: HeroId): string | null {
  const h = state.heroes[heroId]
  if (!h || !h.alive) return 'That hero has fallen.'
  if (state.party.slots.includes(heroId)) return 'That hero is in the party.'
  if (h.training || h.promotion || h.expedition || h.captiveOf) return 'That hero is busy.'
  if (onBounty(state, heroId)) return 'That hero is already out on a bounty.'
  if (isBurntOut(state, heroId)) return 'That hero is burnt out and resting.'
  return null
}

/** Living bench heroes free to take a bounty. */
export function benchHeroes(state: GameState): OwnedHero[] {
  return (Object.values(state.heroes) as OwnedHero[]).filter((h) => benchRefusal(state, h.id) === null)
}

/** Why this bounty can't be posted with these heroes, or null. */
export function bountyRefusal(state: GameState, kind: string, heroIds: readonly HeroId[]): string | null {
  const def = BOUNTIES[kind]
  if (!def) return 'No such bounty.'
  if (state.tower.highestCleared < def.minFloor) return `Clear floor ${def.minFloor} to post this bounty.`
  if ((state.estate?.bounties ?? []).length >= BOUNTY.maxActive) return 'The board is full — wait for a bounty to come back.'
  if (heroIds.length !== def.heroes) return `This bounty needs ${def.heroes} heroes.`
  if (new Set(heroIds).size !== heroIds.length) return 'Each hero can go only once.'
  for (const id of heroIds) {
    const r = benchRefusal(state, id)
    if (r) return r
  }
  if (state.gold < def.gold) return 'Not enough gold.'
  return null
}

/** Post a bounty: pay its gold, send the heroes. Throws when refused. */
export function postBounty(state: GameState, kind: string, heroIds: readonly HeroId[], nowWorld: number): GameState {
  const refusal = bountyRefusal(state, kind, heroIds)
  if (refusal) throw new Error(`postBounty: ${refusal}`)
  const def = BOUNTIES[kind]!
  const at = Math.max(nowWorld, state.meta.lastSeenAtWorld)
  const e = state.estate
  const bounty: Bounty = { id: e.bountySeq, kind, heroIds: [...heroIds], postedAt: at, endsAt: at + def.ms }
  return { ...state, gold: state.gold - def.gold, estate: { ...e, bounties: [...e.bounties, bounty], bountySeq: e.bountySeq + 1 } }
}

function roll(rng: Rng, [lo, hi]: readonly [number, number]): { v: number; rng: Rng } {
  if (hi <= lo) return { v: lo, rng }
  const d = nextInt(rng, lo, hi)
  return { v: d.value, rng: d.rng }
}

export interface BountyHaul {
  materials: Record<MaterialId, number>
  /** XP per hero. */
  xp: Record<HeroId, number>
  item: EquipmentItem | null
}

/** What a bounty brings back (deterministic). */
export function bountyHaul(state: GameState, b: Bounty): BountyHaul {
  const def = BOUNTIES[b.kind]!
  let rng = rngFor(state.seed, 'bounty', b.id, b.kind)
  const scale = 1 + state.tower.highestCleared * BOUNTY.perFloor
  const materials: Record<MaterialId, number> = {}
  let r = roll(rng, def.stones)
  rng = r.rng
  materials.promotionStone = Math.round(r.v * scale)
  r = roll(rng, def.rank)
  rng = r.rng
  if (r.v > 0) materials.rankMaterial = r.v
  const xp: Record<HeroId, number> = {}
  for (const id of b.heroIds) {
    const h = state.heroes[id]
    if (!h || !h.alive) continue
    if (def.attr > 0) materials[attrStoneId(h.element)] = (materials[attrStoneId(h.element)] ?? 0) + def.attr
    xp[id] = Math.max(1, Math.round(xpToNext(h.xp.level) * def.xpShare))
  }
  let item: EquipmentItem | null = null
  const found = chance(rng, def.itemChance)
  rng = found.rng
  if (found.value) {
    const slotDraw = nextInt(rng, 0, 2)
    rng = slotDraw.rng
    const slot = (['weapon', 'armor', 'accessory'] as EquipmentSlot[])[slotDraw.value]!
    let grade = forgeGrade(state.meta.masterLevel)
    const fine = chance(rng, 0.25)
    if (fine.value && GRADES.indexOf(grade) < GRADES.indexOf('S')) grade = GRADES[GRADES.indexOf(grade) + 1]!
    item = {
      id: `eq_${String(state.inventory.length + 1).padStart(6, '0')}` as EquipmentId,
      slot,
      grade,
      name: itemName(slot, grade),
      statBonus: statBlockFor(slot, grade),
    }
  }
  return { materials, xp, item }
}

/** Bring home every bounty whose time is up (rewards land directly). */
export function resolveBounties(state: GameState, nowWorld: number): GameState {
  const e = state.estate
  const due = (e.bounties ?? []).filter((b) => b.endsAt <= nowWorld)
  if (due.length === 0) return state
  let next = state
  const reports: BountyReport[] = []
  const chronicle: ChronicleEntry[] = []
  for (const b of [...due].sort((x, y) => x.endsAt - y.endsAt || x.id - y.id)) {
    const haul = bountyHaul(next, b)
    const materials = { ...next.materials }
    for (const [k, v] of Object.entries(haul.materials)) materials[k] = (materials[k] ?? 0) + v
    const heroes = { ...next.heroes }
    const day = dayOfSlot(slotOf(b.endsAt))
    for (const [id, gain] of Object.entries(haul.xp) as [HeroId, number][]) {
      const h = heroes[id]!
      const life = h.life ? { ...h.life, memories: [...h.life.memories] } : undefined
      if (life) addMemory(life, { kind: 'bounty', day, detail: b.kind, weight: 30 })
      heroes[id] = { ...h, xp: applyXp(h.xp, gain, h.star), ...(life ? { life } : {}) }
    }
    const xpTotal = Object.values(haul.xp).reduce((a, v) => a + v, 0)
    next = { ...next, materials, heroes, inventory: haul.item ? [...next.inventory, haul.item] : next.inventory }
    reports.push({ id: b.id, kind: b.kind, heroIds: b.heroIds, endedAt: b.endsAt, materials: haul.materials, xp: xpTotal, item: haul.item?.name ?? null })
    chronicle.push({ at: b.endsAt, kind: 'bounty', heroIds: b.heroIds, detail: b.kind })
  }
  const bounties = e.bounties.filter((b) => b.endsAt > nowWorld)
  return {
    ...next,
    life: { ...next.life, chronicle: [...next.life.chronicle, ...chronicle].slice(-TUNING.life.chronicleMax) },
    estate: { ...next.estate, bounties, bountyLog: [...reports.reverse(), ...(e.bountyLog ?? [])].slice(0, BOUNTY.logMax) },
  }
}
