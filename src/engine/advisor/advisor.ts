/**
 * Isel's advice: a read-only look at the whole waiting room that names the next useful
 * moves — who is suited to which job, who is ready to promote, who needs rest, which
 * friends fight better together — each with the command that carries it out. Pure: it
 * never changes the state, and the UI decides how to phrase each tip.
 */
import { TUNING } from '../tuning'
import type { Command, EquipmentSlot, GameState, HeroId, JobId, OwnedHero } from '../types'
import { JOBS, aptitude, jobFeeling, jobHolders, jobOpen, jobSeats, bondOf, relationsOf, lifeOf } from '../life'
import { canPromote, canAfford } from '../promotion'
import { banquetWouldHelp } from '../kitchen'
import { dailyUnlocked, dailyAttemptsLeft } from '../daily'
import { equippedItemIds } from '../equipment'
import { GIFTS, favorTier, giftDelta } from '../favor'
import { trainingOptions } from '../training'
import { canFight, heroCp } from '../scout'
import { refusesDeploy } from '../estate/deploy'

/** Where a tip sends the Master when it has no one-click action. */
export type AdvicePlace = 'party' | 'daily' | 'build' | 'kitchen'

interface Base {
  /** Stable key (for dismissing a tip). */
  id: string
  /** Higher shows first. */
  priority: number
  /** Commands that carry the tip out, in order (empty when the tip is a pointer). */
  actions: Command[]
  place?: AdvicePlace
}

export type Advice = Base &
  (
    | { kind: 'fillParty'; open: number }
    | { kind: 'promote'; heroId: HeroId }
    | { kind: 'banquet' }
    | { kind: 'tired'; heroId: HeroId; swapId: HeroId }
    | { kind: 'job'; heroId: HeroId; job: JobId; aptitude: number; likes: boolean }
    | { kind: 'reassign'; heroId: HeroId; job: JobId; replaceId: HeroId; aptitude: number; replaceAptitude: number }
    | { kind: 'equip'; heroId: HeroId; itemId: string; slot: EquipmentSlot }
    | { kind: 'daily'; left: number }
    | { kind: 'friends'; heroId: HeroId; friendId: HeroId }
    | { kind: 'train'; heroId: HeroId; skillId: string; mode: 'refine' | 'learn' }
    | { kind: 'gift'; heroId: HeroId; giftId: string; delta: number }
    | { kind: 'talent'; heroId: HeroId; job: JobId; aptitude: number }
  )

const A = {
  /** A free hero is worth suggesting for a job from this aptitude (1 = average). */
  jobAt: 1.0,
  /** A holder below this (or who resents the job) may be swapped for someone better… */
  poorFitBelow: 0.95,
  /** …who is at least this much better. */
  swapGain: 0.3,
  /** A hero this gifted for a job whose building isn't up yet is worth a mention. */
  talentAt: 1.5,
  /** Party members below this Sanity should rest. */
  tiredBelow: 35,
  /** A replacement must be this rested… */
  restedAt: 60,
  /** …and at least this strong relative to the tired hero. */
  swapCpRatio: 0.8,
  /** Average party Sanity under which a banquet is worth its gold. */
  banquetBelow: 55,
  /** Bench heroes this rested count as ready to fill a slot. */
  benchMinSanity: 40,
  /** At most this many tips. */
  max: 12,
}

function living(state: GameState): OwnedHero[] {
  return (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive && !h.captiveOf)
}

function inParty(state: GameState): Set<HeroId> {
  return new Set(state.party.slots.filter((s): s is HeroId => s !== null))
}

/** Every tip for the waiting room right now, most useful first. */
export function advise(state: GameState): Advice[] {
  const out: Advice[] = []
  const party = inParty(state)
  const heroes = living(state)
  const ready = (h: OwnedHero) => canFight(h) && !refusesDeploy(state, h.id)

  // ── The party ────────────────────────────────────────────────────────────
  const bench = heroes.filter((h) => !party.has(h.id) && ready(h) && h.sanity >= A.benchMinSanity)
  const emptySlots = state.party.slots.filter((s) => s === null || !state.heroes[s]?.alive).length
  if (emptySlots > 0 && bench.length > 0) {
    out.push({ id: 'fillParty', kind: 'fillParty', open: Math.min(emptySlots, bench.length), priority: 95, actions: [], place: 'party' })
  }

  const usedSwaps = new Set<string>()
  for (const id of party) {
    const h = state.heroes[id]
    if (!h?.alive || h.sanity >= A.tiredBelow) continue
    const swap = bench
      .filter((b) => b.sanity >= A.restedAt && !usedSwaps.has(b.id) && heroCp(b) >= heroCp(h) * A.swapCpRatio)
      .sort((a, b) => heroCp(b) - heroCp(a))[0]
    if (!swap) continue
    usedSwaps.add(swap.id)
    const slots = state.party.slots.map((s) => (s === h.id ? swap.id : s))
    out.push({
      id: `tired:${h.id}`,
      kind: 'tired',
      heroId: h.id,
      swapId: swap.id,
      priority: 85,
      actions: [{ type: 'SET_PARTY', slots, lines: [...state.party.lines] }],
    })
  }

  const partyHeroes = [...party].map((id) => state.heroes[id]).filter((h): h is OwnedHero => !!h?.alive)
  if (partyHeroes.length > 0) {
    const avg = partyHeroes.reduce((n, h) => n + h.sanity, 0) / partyHeroes.length
    if (avg < A.banquetBelow && banquetWouldHelp(state) && state.gold >= TUNING.lobby.banquet.gold) {
      out.push({ id: 'banquet', kind: 'banquet', priority: 70, actions: [{ type: 'BANQUET' }] })
    }
  }

  // ── Promotions ───────────────────────────────────────────────────────────
  for (const h of heroes) {
    if (canPromote(h) && canAfford(state, h)) {
      out.push({ id: `promote:${h.id}`, kind: 'promote', heroId: h.id, priority: 80, actions: [{ type: 'PROMOTE_HERO', heroId: h.id }] })
    }
  }

  // ── Jobs: fill open seats with the best-suited free heroes (greedy over all pairs) ──
  const free = heroes.filter((h) => lifeOf(h).job === null && h.expedition === null)
  const seatsLeft = new Map<JobId, number>()
  for (const job of JOBS) if (jobOpen(state, job)) seatsLeft.set(job, jobSeats(state, job) - jobHolders(state, job).length)
  const pairs: { h: OwnedHero; job: JobId; apt: number }[] = []
  for (const h of free) for (const [job, n] of seatsLeft) if (n > 0) pairs.push({ h, job, apt: aptitude(h, job) })
  pairs.sort((a, b) => b.apt - a.apt || a.h.id.localeCompare(b.h.id))
  const placed = new Set<string>()
  for (const p of pairs) {
    if (placed.has(p.h.id) || (seatsLeft.get(p.job) ?? 0) <= 0) continue
    const likes = jobFeeling(p.h, p.job) === 'likes'
    if (p.apt < A.jobAt && !likes) continue
    placed.add(p.h.id)
    seatsLeft.set(p.job, seatsLeft.get(p.job)! - 1)
    out.push({
      id: `job:${p.h.id}:${p.job}`,
      kind: 'job',
      heroId: p.h.id,
      job: p.job,
      aptitude: p.apt,
      likes,
      priority: 60 + Math.round(p.apt * 5),
      actions: [{ type: 'ASSIGN_JOB', heroId: p.h.id, job: p.job }],
    })
  }

  // ── Jobs: a poor fit in a seat when someone free would do much better ──
  for (const job of JOBS) {
    if (!jobOpen(state, job)) continue
    for (const holder of jobHolders(state, job)) {
      const hApt = aptitude(holder, job)
      if (hApt >= A.poorFitBelow && jobFeeling(holder, job) !== 'dislikes') continue
      const better = free
        .filter((h) => !placed.has(h.id) && aptitude(h, job) >= hApt + A.swapGain)
        .sort((a, b) => aptitude(b, job) - aptitude(a, job))[0]
      if (!better) continue
      placed.add(better.id)
      out.push({
        id: `reassign:${holder.id}:${job}`,
        kind: 'reassign',
        heroId: better.id,
        job,
        replaceId: holder.id,
        aptitude: aptitude(better, job),
        replaceAptitude: hApt,
        priority: 50,
        actions: [
          { type: 'ASSIGN_JOB', heroId: holder.id, job: null },
          { type: 'ASSIGN_JOB', heroId: better.id, job },
        ],
      })
    }
  }

  // ── Gear: an empty slot on a party member and a free item that fits ──
  const worn = equippedItemIds(state)
  const taken = new Set<string>()
  for (const h of partyHeroes) {
    for (const slot of ['weapon', 'armor', 'accessory'] as EquipmentSlot[]) {
      if (h.equipment[slot]) continue
      const item = state.inventory.find(
        (i) => i.slot === slot && !worn.has(i.id) && !taken.has(i.id) && (i.exclusiveTo === undefined || i.exclusiveTo === h.id),
      )
      if (!item) continue
      taken.add(item.id)
      out.push({
        id: `equip:${h.id}:${slot}`,
        kind: 'equip',
        heroId: h.id,
        itemId: item.id,
        slot,
        priority: 55,
        actions: [{ type: 'EQUIP_ITEM', heroId: h.id, itemId: item.id }],
      })
    }
  }

  // ── Dailies ──────────────────────────────────────────────────────────────
  const left = dailyUnlocked(state) ? dailyAttemptsLeft(state) : 0
  if (left > 0 && partyHeroes.length > 0) out.push({ id: 'daily', kind: 'daily', left, priority: 40, actions: [], place: 'daily' })

  // ── Friends fight better side by side ──
  const suggestedFriend = new Set<string>()
  for (const h of partyHeroes) {
    for (const [otherId, rel] of relationsOf(state, h.id)) {
      if (bondOf(rel.affinity) !== 'closeFriend' || party.has(otherId) || suggestedFriend.has(otherId)) continue
      const other = state.heroes[otherId]
      if (!other?.alive || !ready(other) || other.sanity < A.restedAt) continue
      suggestedFriend.add(otherId)
      out.push({ id: `friends:${h.id}:${otherId}`, kind: 'friends', heroId: h.id, friendId: otherId, priority: 35, actions: [], place: 'party' })
      break
    }
  }

  // ── Bench heroes could drill a skill ──
  if (state.facilities.trainingCenter.level > 0) {
    let n = 0
    const benchByCp = heroes.filter((h) => !party.has(h.id) && ready(h)).sort((a, b) => heroCp(b) - heroCp(a))
    for (const h of benchByCp) {
      if (n >= 2) break
      const opt = trainingOptions(state, h.id).find((o) => o.ok && o.cost <= state.gold / 4)
      if (!opt) continue
      n++
      out.push({
        id: `train:${h.id}`,
        kind: 'train',
        heroId: h.id,
        skillId: opt.skillId,
        mode: opt.mode,
        priority: 30,
        actions: [{ type: 'TRAIN_SKILL', heroId: h.id, skillId: opt.skillId }],
      })
    }
  }

  // ── A gift a party member would love (once their tastes are known) ──
  let giftBest: { h: OwnedHero; giftId: string; delta: number } | null = null
  for (const h of partyHeroes) {
    if (favorTier(h.favor) < 2 || h.favor >= 80) continue
    for (const g of Object.values(GIFTS)) {
      if (g.gems > 0 || g.gold > state.gold / 5) continue
      const d = giftDelta(h, g.id)
      if (d > 0 && (!giftBest || d > giftBest.delta)) giftBest = { h, giftId: g.id, delta: d }
    }
  }
  if (giftBest) {
    out.push({
      id: `gift:${giftBest.h.id}`,
      kind: 'gift',
      heroId: giftBest.h.id,
      giftId: giftBest.giftId,
      delta: giftBest.delta,
      priority: 25,
      actions: [{ type: 'GIVE_GIFT', heroId: giftBest.h.id, giftId: giftBest.giftId }],
    })
  }

  // ── Talents waiting on a building ──
  for (const job of JOBS) {
    if (jobOpen(state, job)) continue
    const best = heroes.map((h) => ({ h, apt: aptitude(h, job) })).sort((a, b) => b.apt - a.apt)[0]
    if (!best || best.apt < A.talentAt) continue
    out.push({ id: `talent:${best.h.id}:${job}`, kind: 'talent', heroId: best.h.id, job, aptitude: best.apt, priority: 20, actions: [], place: 'build' })
  }

  return out.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, A.max)
}
