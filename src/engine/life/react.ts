/**
 * Quanton Life — how the waiting room reacts to what the Master does. Run by the reducer
 * after every command, comparing the state before and after:
 *
 * - a death (battle, synthesis, a captor's deadline) raises a grave in the Memorial, and
 *   every friend left behind grieves (canon: the lobby remembers, and mourns);
 * - a floor attempt becomes a memory for each survivor (cleared, lost, nearly died), and
 *   fighting side by side draws the party together;
 * - a gift, a promotion, a newcomer (the veterans welcome them — canon Jenna) all leave
 *   their mark;
 * - the legacy of the fallen (spec 2026-10-12 S21-S23): a death leaves an Echo waiting for
 *   an heir, the enemy that struck the blow becomes that hero's Bane (a Nemesis waiting a
 *   few floors up), the Memorial learns the killer's family, and a thinned roster hears a
 *   new face at the bell. When the Bane falls, the friends of the fallen remember it.
 * PURE.
 */
import { TUNING } from '../tuning'
import type { Command, DeathCause, FloorResult, GameState, HeroId, HeroLife, LegacyState, OwnedHero, Relation } from '../types'
import { addMemory, dayOfSlot, lifeOf, relationKey, slotOf, newHeroLife } from './life'
import { personalityOf } from './personality'
import {
  fallenKiller,
  killingBlow,
  leavesEcho,
  livingCount,
  nemesisFor,
  pendingEchoFor,
  type FallenKiller,
  type MemorialRecord,
} from '../legacy/records'

const R = TUNING.life.relation
const G = TUNING.life.grief
const LG = TUNING.legacy
/** Avenging a fallen friend eases the grief this much (0..100 scale). */
const AVENGED_GRIEF_RELIEF = 30

function causeFor(cmd: Command): DeathCause {
  if (cmd.type === 'ATTEMPT_FLOOR') return 'battle'
  if (cmd.type === 'SYNTHESIZE' || cmd.type === 'SYNTHESIZE_CAPTIVE') return 'synthesis'
  return 'captor'
}

/** The lowest HP share each hero hit during a battle (for "nearly died"). */
function lowestHpShare(result: FloorResult): Map<string, number> {
  const max = new Map(result.result.log.unitsInit.map((u) => [u.id, u.maxHP]))
  const low = new Map<string, number>()
  for (const e of result.result.log.events) {
    if (e.kind === 'hit' || e.kind === 'hp-cost') {
      const id = e.kind === 'hit' ? e.targetId : e.unitId
      const m = max.get(id)
      if (!m) continue
      const share = e.hpAfter / m
      if (share < (low.get(id) ?? 1)) low.set(id, share)
    }
  }
  return low
}

export function lifeReact(before: GameState | null, after: GameState, cmd: Command, nowWorld: number, floor?: FloorResult): GameState {
  if (before === null || cmd.type === 'NEW_ACCOUNT') return after
  const day = dayOfSlot(slotOf(Math.max(nowWorld, after.meta.lastSeenAtWorld)))
  const at = Math.max(nowWorld, after.meta.lastSeenAtWorld)
  let heroes: Record<HeroId, OwnedHero> | null = null
  let relations: Record<string, Relation> | null = null
  let chronicle = after.life.chronicle
  let memorial = after.life.memorial
  const lives = new Map<HeroId, HeroLife>()
  const lifeFor = (id: HeroId): HeroLife => {
    let l = lives.get(id)
    if (!l) {
      const h = after.heroes[id]!
      const src = h.life ?? newHeroLife(day)
      l = { ...src, needs: { ...src.needs }, jobXp: { ...src.jobXp }, doing: { ...src.doing }, memories: [...src.memories] }
      if (src.echoes) l.echoes = [...src.echoes]
      lives.set(id, l)
    }
    return l
  }
  const sanityDelta = new Map<HeroId, number>()
  const rel = (a: string, b: string): Relation => {
    relations ??= { ...after.life.relations }
    const k = relationKey(a, b)
    const r = relations[k] ?? { affinity: 0, shared: 0 }
    relations[k] = { ...r }
    return relations[k]!
  }
  const affinity = (a: string, b: string) => after.life.relations[relationKey(a, b)]?.affinity ?? 0
  const push = (e: GameState['life']['chronicle'][number]) => {
    chronicle = [...chronicle, e].slice(-TUNING.life.chronicleMax)
  }
  // The legacy ledger, copied on first write.
  let legacy: LegacyState = after.life.legacy
  const ledger = (): LegacyState => {
    if (legacy === after.life.legacy) {
      legacy = { pending: [...legacy.pending], nemeses: [...legacy.nemeses], recruitTokens: legacy.recruitTokens, lessons: [...legacy.lessons] }
    }
    return legacy
  }

  const deployed = cmd.type === 'ATTEMPT_FLOOR' ? (before.party.slots.filter((id) => id && before.heroes[id]?.alive) as HeroId[]) : []

  // ── Deaths
  const living = (Object.keys(after.heroes) as HeroId[]).filter((id) => after.heroes[id]!.alive)
  const battleLog = floor && cmd.type === 'ATTEMPT_FLOOR' ? floor.result.log : null
  const banedBy = new Set<string>()
  let bellRings = false
  for (const id of Object.keys(before.heroes) as HeroId[]) {
    const was = before.heroes[id]!
    const now = after.heroes[id]
    if (!was.alive || !now || now.alive) continue
    const life = lifeOf(was)
    const cause = causeFor(cmd)
    const mourners = living.filter((o) => affinity(id, o) >= R.friend)
    // Who struck the blow (tower deaths only: the log names the killer).
    const blow = cause === 'battle' && battleLog ? killingBlow(battleLog, id) : null
    const killer: FallenKiller | null = blow ? fallenKiller(blow, legacy.nemeses) : null
    const rec: MemorialRecord = {
      heroId: id,
      name: was.name,
      star: was.star,
      level: was.xp.level,
      heroClass: was.heroClass,
      element: was.element,
      portraitToken: was.portraitToken,
      cause,
      floor: cause === 'battle' ? before.tower.currentFloor : life.bestFloor,
      day,
      daysServed: Math.max(0, day - life.arrivedDay),
      bestFloor: Math.max(life.bestFloor, cause === 'battle' ? before.tower.currentFloor : 0),
      mourners,
      ...(killer ? { killer } : {}),
    }
    memorial = [...memorial, rec]
    push({ at, kind: 'death', heroIds: [id], floor: rec.floor, detail: cause })

    // ── Legacy: the Echo, the Bane, the lesson, the bell
    if (leavesEcho(was, cause) && !legacy.pending.some((p) => p.fallenId === id)) {
      ledger().pending.push(pendingEchoFor(after, was, rec.floor))
    }
    if (killer && blow && !banedBy.has(blow.id)) {
      const waiting = legacy.nemeses.filter((n) => n.status === 'waiting').length
      if (waiting < LG.nemesis.maxActive && !legacy.nemeses.some((n) => n.heroId === id)) {
        const nem = nemesisFor(after.seed, was, killer, rec.floor)
        if (nem) {
          ledger().nemeses.push(nem)
          banedBy.add(blow.id)
        }
      }
    }
    if (killer?.family !== undefined && !legacy.lessons.includes(killer.family)) {
      const l = ledger()
      l.lessons = [...l.lessons, killer.family].sort()
    }
    if (cause !== 'synthesis') bellRings = true
    for (const o of living) {
      const aff = affinity(id, o)
      const oh = after.heroes[o]!
      if (aff >= R.friend) {
        const p = personalityOf(oh)
        const l = lifeFor(o)
        l.grief = Math.min(100, l.grief + G.base + aff * G.perAffinity)
        addMemory(l, { kind: 'friendDied', day, other: id, floor: rec.floor, weight: 90 })
        sanityDelta.set(o, (sanityDelta.get(o) ?? 0) - (G.sanityBase + aff * G.sanityPerAffinity) * (1 - p.courage * 0.4))
      } else if (deployed.includes(o)) {
        addMemory(lifeFor(o), { kind: 'comradeDied', day, other: id, floor: rec.floor, weight: 60 })
      }
    }
  }

  // A death that thins the roster below five: a new face answers the bell (S23).
  if (bellRings && livingCount(after) < LG.recruit.rosterBelow && legacy.recruitTokens < LG.recruit.maxTokens) {
    ledger().recruitTokens = Math.min(LG.recruit.maxTokens, legacy.recruitTokens + 1)
  }

  // ── A floor attempt: memories and brothers-in-arms
  if (floor && cmd.type === 'ATTEMPT_FLOOR') {
    const survivors = floor.result.survivorHeroIds.filter((id) => after.heroes[id]?.alive)
    const low = lowestHpShare(floor)
    for (const id of survivors) {
      const l = lifeFor(id)
      l.bestFloor = Math.max(l.bestFloor, floor.floor)
      const share = low.get(id) ?? 1
      if (share < 0.15) addMemory(l, { kind: 'nearDeath', day, floor: floor.floor, weight: 55 })
      else if (floor.cleared && (floor.firstClear || floor.floor % 5 === 0)) addMemory(l, { kind: 'floorCleared', day, floor: floor.floor, weight: floor.floor % 5 === 0 ? 45 : 25 })
      else if (floor.result.outcome === 'retreat') addMemory(l, { kind: 'retreated', day, floor: floor.floor, weight: 35 })
      else if (!floor.cleared) addMemory(l, { kind: 'floorLost', day, floor: floor.floor, weight: 40 })
    }
    for (let i = 0; i < survivors.length; i++) {
      for (let j = i + 1; j < survivors.length; j++) {
        const r = rel(survivors[i]!, survivors[j]!)
        r.shared += 1
        r.affinity = Math.min(100, r.affinity + R.sharedBattle)
      }
    }
  }

  // ── Revenge: a Bane fell. The friends of the fallen, and those who struck it down, remember.
  if (floor && cmd.type === 'ATTEMPT_FLOOR' && (floor.nemesisDefeated?.length ?? 0) > 0) {
    const survivors = floor.result.survivorHeroIds.filter((id) => after.heroes[id]?.alive)
    for (const nid of floor.nemesisDefeated!) {
      // Once only: a Bane already avenged before this attempt is not avenged again.
      if (before.life.legacy.nemeses.find((n) => n.id === nid)?.status !== 'waiting') continue
      const idx = legacy.nemeses.findIndex((n) => n.id === nid)
      if (idx < 0) continue
      const nem = legacy.nemeses[idx]!
      if (nem.status !== 'avenged') ledger().nemeses[idx] = { ...nem, status: 'avenged' }
      const friends = living.filter((o) => affinity(nem.heroId, o) >= R.friend)
      for (const o of [...new Set([...friends, ...survivors])]) {
        const friend = friends.includes(o)
        const l = lifeFor(o)
        addMemory(l, { kind: 'avenged', day, other: nem.heroId, floor: floor.floor, weight: friend ? 75 : 50 })
        if (friend) l.grief = Math.max(0, l.grief - AVENGED_GRIEF_RELIEF)
      }
      push({ at, kind: 'revenge', heroIds: survivors.length > 0 ? survivors : friends, floor: floor.floor, detail: nem.id })
    }
  }

  // ── Gifts, promotions, newcomers
  if (cmd.type === 'GIVE_GIFT' && after.heroes[cmd.heroId]?.alive) {
    const l = lifeFor(cmd.heroId)
    l.memories = l.memories.filter((m) => m.kind !== 'gift')
    addMemory(l, { kind: 'gift', day, detail: cmd.giftId, weight: 35 })
  }
  for (const id of living) {
    const b = before.heroes[id]
    const a = after.heroes[id]!
    if (b && b.alive && a.star > b.star) addMemory(lifeFor(id), { kind: 'promoted', day, detail: String(a.star), weight: 50 })
    if (!b) {
      // A newcomer: the warmest veteran welcomes them (canon: Jenna explains the world).
      const vets = living.filter((o) => o !== id && before.heroes[o]?.alive)
      let host: HeroId | null = null
      let best = 0.6
      for (const o of vets) {
        const w = personalityOf(after.heroes[o]!).warmth
        if (w > best) {
          best = w
          host = o
        }
      }
      lifeFor(id)
      if (host) {
        const r = rel(id, host)
        r.affinity = Math.max(r.affinity, 12)
        push({ at, kind: 'arrival', heroIds: [id, host] })
      } else push({ at, kind: 'arrival', heroIds: [id] })
    }
  }

  if (lives.size === 0 && relations === null && chronicle === after.life.chronicle && memorial === after.life.memorial && legacy === after.life.legacy)
    return after
  heroes = { ...after.heroes }
  for (const [id, l] of lives) {
    const h = heroes[id]!
    const s = Math.max(0, Math.min(TUNING.lobby.sanityMax, h.sanity + (sanityDelta.get(id) ?? 0)))
    heroes[id] = { ...h, life: l, sanity: Math.round(s * 100) / 100 }
  }
  return { ...after, heroes, life: { ...after.life, relations: relations ?? after.life.relations, chronicle, memorial, legacy } }
}
