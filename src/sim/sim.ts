/**
 * The balance simulator: deterministic playtest bots that play the REAL game.
 *
 * A bot never touches engine internals: it only reads state and dispatches the same
 * Commands the UI does, through `reduce` (and `attemptFloorWithResult` to learn what a
 * climb did). Time passes as it would for a person who opens the game a few times a
 * day; world-time runs at the canon dilation, so timers, Sanity regen, dailies, the
 * login streak, invasions and PI decay all behave as they would in play.
 *
 * Three profiles bracket the audience: a casual free player, an engaged free player
 * who uses every system, and a whale. Everything is seeded, so a run is repeatable.
 */
import { TUNING } from '../engine/tuning'
import type { GameState, HeroId, Line, OwnedHero, EquipmentSlot, Command, FloorResult, BonusRoomKind, FacilityId, JobId, CombatLog, BattleOrder } from '../engine/types'
import { reduce, attemptFloorWithResult } from '../engine/store'
import { toWorldTime } from '../engine/time'
import { skillCp } from '../engine/skills'
import { canPromote, canAfford } from '../engine/promotion'
import { canUpgrade } from '../engine/facilities'
import { dailyUnlocked, dailyAttemptsLeft, worldDayIndex } from '../engine/daily'
import { banquetReady, banquetWouldHelp } from '../engine/kitchen'
import { boundElsewhere, canCraft, equippedItemIds } from '../engine/equipment'
import { floorPower, buildEncounter, fitCount } from '../engine/tower'
import { heroCpFull } from '../engine/unit/trueCp'
import { forecastFloor } from '../engine/scout/forecast'
import { ANCHORS } from '../engine/content'
import { loginClaimed, packageRefusal } from '../engine/shop'
import { crackRefusal, dispatchRefusal } from '../engine/rift'
import { challengeOf } from '../engine/challenge'
import { GIFTS, giftDelta } from '../engine/favor'
import { BOUNTIES, BOUNTY, benchHeroes, bountyRefusal, decorOptions, duelPurse, duelRefusal, estateBusy, refusesDeploy, statueCost, statueRefusal } from '../engine/estate'
import { crystalChargeLeft } from '../engine/gacha'
import { aptitude, jobHolders, jobOpen, jobSeats } from '../engine/life'
import { completeTraining, trainingOptions } from '../engine/training'
import { transferCost, transferRefusal, transferredLevel } from '../engine/transfer'
import { synthesisUnlocked } from '../engine/synthesis'
import { resolveMerges } from '../engine/skills'
import {
  canEnterTrial,
  fitToFight,
  heroAllowed,
  raidChestReady,
  raidRecord,
  raidRefusal,
  raidsOpen,
  weeklyAttemptsLeft,
  weeklyFor,
  weeklyRefusal,
  weeklyRule,
  weeklyUnlocked,
  worldWeekOf,
} from '../engine/challenge'

export type ProfileId = 'casual' | 'engaged' | 'whale'

export interface Profile {
  id: ProfileId
  label: string
  /** Times the game is opened per real day. */
  sessionsPerDay: number
  /** Floor attempts a session will make at most (a loss ends the climbing for that session). */
  attemptsPerSession: number
  /** A hero below this Sanity sits the climb out. */
  restSanity: number
  dailies: boolean
  facilities: 'core' | 'all'
  advancedPool: boolean
  gifts: boolean
  crack: boolean
  guild: boolean
  equipment: boolean
  /** Simulated spend per real week, in USD (0 = free player). */
  usdPerWeek: number
  /** Gold kept back from the estate's sinks (decorations, statues, bounties). */
  estateReserve: number
  /** Give bench heroes building jobs (the Living Lobby). */
  jobs: boolean
  /** Training Center drills at the end of a session. */
  drills: boolean
  /** Synthesis (salvage the surplus, transfer grades) and Transfer Station skill moves. */
  synthesis: boolean
  /** Pull the party out of a fight that is clearly lost (a battle order). */
  retreat: boolean
  /** Tower challenges: raids on cleared anchors, the weekly Crack trial, tryout duels. */
  raids: boolean
  trial: boolean
  duels: boolean
  /** Read the war room's forecast before a floor: enter on good odds, or after a week of waiting. */
  forecast: boolean
}

export const PROFILES: Record<ProfileId, Profile> = {
  casual: {
    id: 'casual',
    label: 'Casual free player',
    sessionsPerDay: 2,
    attemptsPerSession: 3,
    restSanity: 30,
    dailies: true,
    facilities: 'core',
    advancedPool: true,
    gifts: false,
    crack: false,
    guild: false,
    equipment: false,
    usdPerWeek: 0,
    estateReserve: 150_000,
    // Jobs measured neutral for a casual over 16 seeds (balance pass 2), so it keeps it simple.
    jobs: false,
    drills: false,
    synthesis: false,
    retreat: false,
    raids: false,
    trial: false,
    duels: false,
    forecast: false,
  },
  engaged: {
    id: 'engaged',
    label: 'Engaged free player',
    sessionsPerDay: 4,
    attemptsPerSession: 4,
    restSanity: 40,
    dailies: true,
    facilities: 'all',
    advancedPool: true,
    gifts: true,
    crack: true,
    guild: true,
    equipment: true,
    usdPerWeek: 0,
    estateReserve: 200_000,
    jobs: true,
    drills: true,
    synthesis: true,
    retreat: true,
    raids: true,
    trial: true,
    duels: true,
    forecast: true,
  },
  whale: {
    id: 'whale',
    label: 'Whale',
    sessionsPerDay: 5,
    attemptsPerSession: 5,
    restSanity: 40,
    dailies: true,
    facilities: 'all',
    advancedPool: true,
    gifts: true,
    crack: true,
    guild: true,
    equipment: true,
    usdPerWeek: 120,
    estateReserve: 300_000,
    jobs: true,
    drills: true,
    synthesis: true,
    retreat: true,
    raids: true,
    trial: true,
    duels: true,
    forecast: true,
  },
}

/** One end-of-day snapshot. */
export interface DaySample {
  day: number
  highestCleared: number
  gold: number
  gems: number
  alive: number
  /** Heroes lost in battle (the tower, raids) — not those given up to synthesis. */
  deaths: number
  /** Sum of the five strongest living heroes' CP. */
  topCp: number
  /** The target power budget of the next floor. */
  nextFloorPower: number
  masterLevel: number
  avgSanity: number
  spentUsd: number
  pi: number
  /** Advanced (gem) pulls made so far. */
  advPulls: number
}

/** One floor attempt: how strong the party was against the floor's budget, and how it went. */
export interface AttemptLog {
  day: number
  floor: number
  /** Deployed party CP ÷ the floor's power budget. */
  ratio: number
  won: boolean
  fallen: number
}

export interface SimResult {
  profile: ProfileId
  seed: number
  log: AttemptLog[]
  days: DaySample[]
  /** Attempts made at each floor. */
  attempts: Record<number, number>
  /** Heroes lost at each floor. */
  deaths: Record<number, number>
  /** The day each floor was first cleared. */
  firstClearDay: Record<number, number>
  /** Invasions suffered / heroes lost to captor synthesis. */
  invasions: number
  captiveLosses: number
  worldEnded: boolean
  worldSaved: boolean
  deleted: boolean
  /** Commands the bot tried that the engine refused, by type (a sanity check on the bot). */
  refusals: Record<string, number>
  /** How often each lever was pulled (see LEVERS; plus RETREAT, RAID_CLEAR, RAID_DEATHS,
   *  RETREAT_SAVED — heroes a retreat brought home — SACRIFICED to synthesis, ADV_PULLS,
   *  TRIAL_BEST, the best weekly score, and TRAIN_ROLE — a drill that gave the top five its
   *  first healer or tank, lane F). */
  levers: Record<string, number>
}

/** Commands counted as levers when the engine accepts them. */
const LEVERS = new Set<Command['type']>(['BANQUET', 'ASSIGN_JOB', 'TRAIN_SKILL', 'SYNTHESIZE', 'TRANSFER_SKILL', 'TOWER_RAID', 'WEEKLY_TRIAL', 'HOST_DUEL', 'POST_BOUNTY', 'BUY_DECOR', 'RAISE_STATUE', 'UPGRADE_FACILITY'])

const REAL_DAY_MS = 86_400_000
/** Gold in hand before a bot builds a Living Lobby workplace (surplus, not summon money). */
const LOBBY_BUILD_GOLD = 60_000
/** Heroes past this CP rank are "surplus" for synthesis and skill donation. */
const KEEP_RANKS = 15
/** Jobs the bots fill, most useful first (the forge needs an order and stones: left out). */
/** Gold a bot keeps in hand when paying for drills, skill transfers and duels. */
const SPARE_GOLD = 15_000
/** Skills that bind wounds, and skills that hold the line (lane F: the bots' role drills). */
const HEAL_SKILLS: readonly string[] = ['first_aid', 'regeneration', 'field_medicine', 'mending_light']
const TANK_SKILLS: readonly string[] = ['basic_shield', 'indomitability', 'unyielding', 'sword_shield_technique']
/** How much a missing role weighs in a drill choice, in skill-CP points. */
const ROLE_DRILL_BONUS = 8
/** A raid goes ahead only when every party's CP is this multiple of the anchor's budget. */
const RAID_MARGIN = 1.5
const JOB_ORDER: JobId[] = ['healer', 'cook', 'instructor', 'scholar', 'merchant', 'gardener', 'guard']
/** A fixed real-time epoch so runs never depend on the wall clock. */
const REAL_EPOCH = Date.UTC(2026, 0, 5)
const SIZE = TUNING.account.partySize
/** The war room: a forecast bot enters when the crystal gives at least this win %… */
const FORECAST_ENTER_WIN = 70
/** …and costs fewer heroes than this an attempt; otherwise it waits — up to a week on a floor. */
const FORECAST_ENTER_DEATHS = 1.5
const FORECAST_PATIENCE_DAYS = 7

/**
 * The CP a person sees on screen — the TRUE CP combat fields (gear, favor, Sanity…:
 * engine/unit/trueCp). Memoized per state object (the bot's state changes only through
 * commands), so the bots' many sorts stay cheap. Without a state: bare-handed.
 */
export function heroCp(h: OwnedHero, s?: GameState): number {
  if (!s) return heroCpFull({ inventory: [] }, h)
  let byHero = CP_CACHE.get(s)
  if (!byHero) CP_CACHE.set(s, (byHero = new WeakMap()))
  let cp = byHero.get(h)
  if (cp === undefined) byHero.set(h, (cp = heroCpFull(s, h)))
  return cp
}
const CP_CACHE = new WeakMap<GameState, WeakMap<OwnedHero, number>>()

function living(s: GameState): OwnedHero[] {
  return (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive)
}

function available(h: OwnedHero): boolean {
  return h.alive && h.training === null && h.expedition === null && !h.captiveOf && h.promotion === null
}

/** A mutable bot context: the state plus what the run has recorded. */
class Bot {
  s: GameState
  now = 0
  readonly res: SimResult
  private lastInvasionLog = 0
  /** A free player's gem stash reached a ten-pull and is being spent. */
  private gemStash = false
  private lastSynthDay = -1
  private lastRaidDay = -1
  private lastTrialDay = -1
  private lastDuelDay = -1
  /** After a loss, the party strength and day it happened (a person waits to get stronger). */
  private lastLoss: { floor: number; ratio: number; day: number; wiped: boolean } | null = null
  /** The floor the crystal first told the bot to wait on, and the day (lane C's war room). */
  private waitingSince: { floor: number; day: number } | null = null

  constructor(
    readonly p: Profile,
    seed: number,
    readonly onAttempt?: AttemptHook,
    readonly epoch: number = REAL_EPOCH,
  ) {
    this.s = reduce(null, { type: 'NEW_ACCOUNT', seed, now: epoch })
    this.res = {
      profile: p.id,
      seed,
      log: [],
      days: [],
      attempts: {},
      deaths: {},
      firstClearDay: {},
      invasions: 0,
      captiveLosses: 0,
      worldEnded: false,
      worldSaved: false,
      deleted: false,
      refusals: {},
      levers: {},
    }
  }

  private lever(key: string, n = 1): void {
    this.res.levers[key] = (this.res.levers[key] ?? 0) + n
  }

  /** Dispatch; a refusal is counted and swallowed (the bot's guess was wrong, the game is fine). */
  try(cmd: Command): boolean {
    try {
      this.s = reduce(this.s, cmd, this.now)
      if (LEVERS.has(cmd.type)) this.lever(cmd.type === 'SYNTHESIZE' ? `SYNTHESIZE:${cmd.mode}` : cmd.type)
      if (cmd.type === 'SUMMON' && cmd.pool === 'advanced') this.lever('ADV_PULLS', cmd.count ?? 1)
      if (cmd.type === 'SYNTHESIZE') this.lever('SACRIFICED', cmd.sacrificeIds.length)
      return true
    } catch {
      this.res.refusals[cmd.type] = (this.res.refusals[cmd.type] ?? 0) + 1
      return false
    }
  }

  session(realMs: number, day: number): void {
    this.now = toWorldTime(realMs)
    this.try({ type: 'TICK' })
    if (this.s.meta.deleted) return
    this.trackInvasions()
    this.shop()
    this.resolveEvent()
    this.sideRoom()
    this.buildFacilities()
    this.promote()
    if (this.p.synthesis) this.synthesis(day)
    this.summon()
    if (this.p.equipment) this.forge()
    if (this.p.gifts) this.gifts()
    if (this.p.guild) this.guild()
    this.rescueCaptives()
    this.feast()
    this.estate()
    if (this.p.jobs) this.jobs()
    this.setParty()
    if (this.p.dailies) this.dailies()
    this.climb(day)
    // After the climb: the side attractions, then the yard (drills lock heroes for an hour).
    if (this.p.raids) this.raid(day)
    if (this.p.crack) this.rift()
    if (this.p.trial) this.trial(day)
    if (this.p.duels) this.duel(day)
    if (this.p.drills) this.drills()
  }

  private trackInvasions(): void {
    const ins = this.s.pvp.log.filter((l) => l.direction === 'in')
    if (ins.length > this.lastInvasionLog) {
      this.res.invasions += ins.length - this.lastInvasionLog
      this.lastInvasionLog = ins.length
    }
  }

  private shop(): void {
    if (!loginClaimed(this.s, this.now)) this.try({ type: 'CLAIM_LOGIN' })
    if (this.p.usdPerWeek <= 0) return
    if (this.s.meta.monthly === null || this.s.meta.monthly.daysLeft <= 0) this.try({ type: 'BUY_PACKAGE', packageId: 'monthly' })
    this.try({ type: 'CLAIM_MONTHLY' })
    const weeks = Math.floor((this.now - toWorldTime(this.epoch)) / (7 * 3 * REAL_DAY_MS)) + 1
    const budget = weeks * this.p.usdPerWeek
    for (const id of ['hoard', 'vault', 'chest', 'satchel', 'pouch']) {
      const pkg = TUNING.shop.packages[id]!
      while (this.s.meta.wallet.spentUsd + pkg.usd <= budget && packageRefusal(this.s, id) === null) {
        if (!this.try({ type: 'BUY_PACKAGE', packageId: id })) break
      }
    }
  }

  private resolveEvent(): void {
    const ev = this.s.tower.event
    if (!ev) return
    const tired = this.avgSanity() < 60
    const pref = ev.kind === 'tournament' ? ['team', 'party_raid', 'battle_royale', 'pair', 'deathmatch'] : tired ? ['rest', 'treasure'] : ['treasure', 'merchant', 'rest']
    for (const o of [...pref, ...ev.options]) {
      if (ev.options.includes(o) && this.try({ type: 'RESOLVE_EVENT', option: o })) return
    }
    // A tournament queued behind a recovery (B19) can open on a party of the fallen: field
    // whoever is fit and enter, rather than wait on the graves.
    if (ev.kind === 'tournament') {
      this.setParty()
      for (const o of [...pref, ...ev.options]) {
        if (ev.options.includes(o) && this.try({ type: 'RESOLVE_EVENT', option: o })) return
      }
    }
  }

  private buildFacilities(): void {
    const order =
      this.p.facilities === 'core'
        ? (['kitchen', 'promotionChamber', 'tacticalCenter'] as const)
        : (['kitchen', 'promotionChamber', 'tacticalCenter', 'trainingCenter', 'hallOfMagic', 'transferStation'] as const)
    for (const f of order) {
      // Keep a summon's worth of gold in reserve so upgrades don't starve the roster.
      if (canUpgrade(this.s, f) && this.s.gold >= TUNING.gacha.normalCostGold) this.try({ type: 'UPGRADE_FACILITY', facility: f })
    }
    if (!this.p.jobs) return
    // The buildings the jobs work in, from surplus only and to a few seats each.
    const lobby: FacilityId[] = this.p.facilities === 'core' ? ['garden'] : ['infirmary', 'garden', 'library', 'market', 'watchtower']
    for (const f of lobby) {
      if (this.s.facilities[f].level < 3 && canUpgrade(this.s, f) && this.s.gold >= LOBBY_BUILD_GOLD) this.try({ type: 'UPGRADE_FACILITY', facility: f })
    }
  }

  private promote(): void {
    for (const h of living(this.s)) {
      if (available(h) && canPromote(h) && canAfford(this.s, h)) this.try({ type: 'PROMOTE_HERO', heroId: h.id })
    }
  }

  private summon(): void {
    const cost = TUNING.gacha.normalCostGold
    const cap = this.summonCap()
    let guard = 0
    if (!this.s.life.guide.tutorialPull) this.try({ type: 'SUMMON', pool: 'normal', count: 10 }) // the free tutorial draw
    if (living(this.s).length === 0) this.try({ type: 'SUMMON', pool: 'normal' }) // the mercy pull
    // Fill the party first; after that, keep a pull's worth of gold in hand.
    const reserve = (n: number) => (n < SIZE ? cost : cost * 2)
    while (living(this.s).length < cap && this.s.gold >= reserve(living(this.s).length) && guard++ < 20) {
      if (!this.try({ type: 'SUMMON', pool: 'normal' })) break
    }
    if (!this.p.advancedPool) return
    const adv = TUNING.gacha.advanced
    // A free player saves up for a discounted ten-pull and then spends the stash; a payer
    // pulls whenever there are gems. Either way, only what the crystal's charge allows
    // (singles once it is below ten).
    if (this.s.gems >= adv.tenPullGems) this.gemStash = true
    guard = 0
    while (guard++ < 20 && (this.gemStash || this.p.usdPerWeek > 0)) {
      const charge = crystalChargeLeft(this.s)
      if (charge >= 10 && this.s.gems >= adv.tenPullGems) {
        if (!this.try({ type: 'SUMMON', pool: 'advanced', count: 10 })) break
      } else if (charge >= 1 && this.s.gems >= adv.costGems) {
        if (!this.try({ type: 'SUMMON', pool: 'advanced', count: 1 })) break
      } else break
    }
    if (this.s.gems < adv.costGems) this.gemStash = false
  }

  /** A casual player keeps a small bench; the engaged keep pulling while gold is spare. */
  private summonCap(): number {
    return this.p.id === 'casual' ? 15 : 40
  }

  private forge(): void {
    const slots: EquipmentSlot[] = ['weapon', 'armor', 'accessory']
    let guard = 0
    // Forge only from surplus: stones go to promotions first.
    const spareStones = () => (this.s.materials.promotionStone ?? 0) >= 120
    while (canCraft(this.s) && spareStones() && this.s.inventory.length < 15 && this.s.gold >= 20_000 && guard++ < 3) {
      this.try({ type: 'CRAFT_EQUIPMENT', slot: slots[this.s.inventory.length % 3]! })
    }
    // Put the best free item of each slot on the strongest heroes.
    const top = this.bestFive()
    for (const slot of slots) {
      for (const h of top) {
        const worn = equippedItemIds(this.s)
        const cur = this.s.heroes[h.id]!.equipment[slot]
        const curGrade = cur ? (this.s.inventory.find((i) => i.id === cur)?.grade ?? 'E') : null
        const free = this.s.inventory
          .filter((i) => i.slot === slot && !worn.has(i.id) && !boundElsewhere(this.s, i, h.id))
          .sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade))[0]
        if (free && (curGrade === null || gradeRank(free.grade) > gradeRank(curGrade))) {
          if (cur) this.try({ type: 'UNEQUIP_ITEM', heroId: h.id, slot })
          this.try({ type: 'EQUIP_ITEM', heroId: h.id, itemId: free.id })
        }
      }
    }
  }

  private gifts(): void {
    if (this.s.gold < 30_000) return
    for (const h of this.bestFive()) {
      const best = Object.values(GIFTS)
        .filter((g) => g.gems === 0 && g.gold <= this.s.gold - 20_000)
        .map((g) => ({ g, d: giftDelta(this.s.heroes[h.id]!, g.id) }))
        .sort((a, b) => b.d - a.d)[0]
      if (best && best.d > 0 && this.s.heroes[h.id]!.favor < 90) this.try({ type: 'GIVE_GIFT', heroId: h.id, giftId: best.g.id })
    }
  }

  private guild(): void {
    if (this.s.pvp.guild === null) this.try({ type: 'JOIN_GUILD', guildId: 'morning_star' })
    this.try({ type: 'CLAIM_GUILD_AID' })
    this.try({ type: 'GUILD_RAID' })
  }

  private rescueCaptives(): void {
    for (const h of living(this.s)) {
      if (!h.captiveOf) continue
      if (!this.try({ type: 'RANSOM_HERO', heroId: h.id })) this.try({ type: 'COUNTER_RAID', heroId: h.id })
    }
  }

  private feast(): void {
    // The hall needs a day between feasts (B8): a person waits for it rather than knocking.
    if (this.avgSanity() < 55 && banquetWouldHelp(this.s) && banquetReady(this.s) && this.s.gold >= TUNING.lobby.banquet.gold * 3) this.try({ type: 'BANQUET' })
  }

  /**
   * The estate's gold sinks, from surplus only (above the profile's reserve): a statue for
   * a fallen hero someone mourns, the cheapest decoration upgrade, and bounties for the
   * bench (the richest the board allows, manned by the weakest free heroes).
   */
  private estate(): void {
    const spare = () => this.s.gold - this.p.estateReserve
    // A word with anyone who has withdrawn (it costs nothing and brings them back).
    for (const [id, t] of Object.entries(this.s.estate.trauma)) {
      if (t.withdrawn) this.try({ type: 'TALK_TO_HERO', heroId: id as HeroId })
    }
    // A statue for the most-mourned fallen hero without one.
    const graves = this.s.life.memorial
      .filter((r) => statueRefusal(this.s, r.heroId) === null && r.mourners.length > 0)
      .sort((a, b) => b.mourners.length - a.mourners.length || statueCost(a) - statueCost(b))
    if (graves[0] && statueCost(graves[0]) < spare()) this.try({ type: 'RAISE_STATUE', heroId: graves[0].heroId })
    // Up to two decoration upgrades, cheapest first.
    for (let i = 0; i < 2; i++) {
      const next = decorOptions(this.s)
        .filter((o) => o.refusal === null && o.cost !== null && o.cost < spare())
        .sort((a, b) => a.cost! - b.cost!)[0]
      if (!next || !this.try({ type: 'BUY_DECOR', decor: next.def.id })) break
    }
    // Bounties for the bench: the best job the board allows, the weakest free heroes on it.
    let guard = 0
    while (this.s.estate.bounties.length < BOUNTY.maxActive && guard++ < BOUNTY.maxActive) {
      const kinds = Object.values(BOUNTIES)
        .filter((b) => b.minFloor <= this.s.tower.highestCleared && b.gold < spare() / 2)
        .sort((a, b) => b.gold - a.gold)
      const bench = benchHeroes(this.s).sort((a, b) => heroCp(a, this.s) - heroCp(b, this.s))
      const kind = kinds.find((k) => bench.length >= k.heroes)
      if (!kind) break
      const ids = bench.slice(0, kind.heroes).map((h) => h.id)
      if (bountyRefusal(this.s, kind.id, ids) !== null || !this.try({ type: 'POST_BOUNTY', bounty: kind.id, heroIds: ids })) break
    }
  }

  /** CP-ranked living heroes, strongest first. */
  private ranked(): OwnedHero[] {
    return living(this.s).sort((a, b) => heroCp(b, this.s) - heroCp(a, this.s))
  }

  /** The surplus: home and free, outside the KEEP_RANKS strongest and the party (weakest first). */
  private surplus(): OwnedHero[] {
    const keep = new Set<HeroId>(this.ranked().slice(0, KEEP_RANKS).map((h) => h.id))
    for (const id of this.s.party.slots) if (id) keep.add(id)
    return living(this.s)
      .filter((h) => !keep.has(h.id) && available(h) && !refusesDeploy(this.s, h.id))
      .sort((a, b) => heroCp(a, this.s) - heroCp(b, this.s))
  }

  /** Jobs: fill each open seat with the bench hero who takes to it best (never one who resents it). */
  private jobs(): void {
    const top = new Set(this.ranked().slice(0, 8).map((h) => h.id))
    for (const job of JOB_ORDER) {
      let guard = 0
      while (jobOpen(this.s, job) && jobHolders(this.s, job).length < jobSeats(this.s, job) && guard++ < 5) {
        const pick = living(this.s)
          .filter((h) => !top.has(h.id) && !h.captiveOf && (h.life?.job ?? null) === null && aptitude(h, job) >= TUNING.life.jobs.dislikeAt)
          .sort((a, b) => aptitude(b, job) - aptitude(a, job))[0]
        if (!pick || !this.try({ type: 'ASSIGN_JOB', heroId: pick.id, job })) break
      }
    }
  }

  /**
   * Synthesis, at most once a day (every synthesis costs the whole roster Sanity): with the
   * roster full, render the weakest surplus 1–2★ into stones (rescuing a skill or their
   * best grade onto a rested top hero); a payer, drowning in 3★, also feeds one spare's
   * better grades into its strongest. Then the Transfer Station moves skills.
   */
  private synthesis(day: number): void {
    if (synthesisUnlocked(this.s) && this.lastSynthDay !== day) {
      const spare = this.surplus()
      const top = this.ranked().find((h) => available(h) && h.sanity >= 85)
      if (living(this.s).length >= this.summonCap() - 1) {
        const doomed = spare
          .filter((h) => h.star <= 2)
          .slice(0, 5)
          .map((h) => h.id)
        if (doomed.length >= 3 && this.try({ type: 'SYNTHESIZE', mode: 'salvage', survivorId: top?.id ?? null, sacrificeIds: doomed })) this.lastSynthDay = day
      }
      if (this.lastSynthDay !== day && this.p.usdPerWeek > 0 && top) {
        const donor = spare
          .filter((h) => h.star <= 3)
          .map((h) => ({ h, d: gradeGain(top, h) }))
          .sort((a, b) => b.d - a.d)[0]
        if (donor && donor.d >= 2 && this.try({ type: 'SYNTHESIZE', mode: 'transfer', survivorId: top.id, sacrificeIds: [donor.h.id] })) this.lastSynthDay = day
      }
    }
    this.skillTransfers()
  }

  /** Transfer Station: move a surplus hero's skill onto a party hero who lacks it (two a session). */
  private skillTransfers(): void {
    const station = this.s.facilities.transferStation.level
    if (station <= 0) return
    let moved = 0
    const donors = this.surplus()
    for (const r of this.bestFive()) {
      if (moved >= 2) break
      const recipient = this.s.heroes[r.id]!
      const before = skillCp(recipient.skills)
      let best: { donor: HeroId; skill: string; gain: number } | null = null
      for (const d of donors) {
        for (const sk of this.s.heroes[d.id]!.skills) {
          if (this.s.gold - transferCost(sk.id) < SPARE_GOLD || transferRefusal(this.s, d.id, r.id, sk.id) !== null) continue
          const gain = skillCp(resolveMerges([...recipient.skills, { id: sk.id, level: transferredLevel(sk.level, station), xp: 0 }])) - before
          if (gain > 0 && (!best || gain > best.gain)) best = { donor: d.id, skill: sk.id, gain }
        }
      }
      if (best && this.try({ type: 'TRANSFER_SKILL', donorId: best.donor, recipientId: r.id, skillId: best.skill })) moved++
    }
  }

  /** Training Center: before logging off, drill the strongest few (a drill takes an hour).
   *  ROLES (lane F): a top five with nobody to bind wounds learns First Aid or Regeneration,
   *  and one with nobody to hold the line puts Basic Shield or Indomitability on a front-liner
   *  (counted as TRAIN_ROLE). */
  private drills(): void {
    const centre = this.s.facilities.trainingCenter.level
    if (centre <= 0) return
    let started = 0
    const top = this.ranked().slice(0, 5)
    const knows = (ids: readonly string[]) => top.some((h) => h.skills.some((sk) => ids.includes(sk.id)))
    let needHeal = !knows(HEAL_SKILLS)
    let needTank = !knows(TANK_SKILLS)
    for (const h of this.ranked().slice(0, 8)) {
      if (started >= 5 || this.s.gold < SPARE_GOLD) break
      if (!available(h) || refusesDeploy(this.s, h.id)) continue
      const before = skillCp(h.skills)
      const frontLiner = h.heroClass === 'warrior' || h.heroClass === 'spearman'
      const roleBonus = (id: string) =>
        (needHeal && HEAL_SKILLS.includes(id) ? ROLE_DRILL_BONUS : 0) + (needTank && frontLiner && TANK_SKILLS.includes(id) ? ROLE_DRILL_BONUS : 0)
      const best = trainingOptions(this.s, h.id)
        .filter((o) => o.ok && this.s.gold - o.cost >= SPARE_GOLD)
        .map((o) => ({
          o,
          gain: skillCp(completeTraining({ ...h, training: { skillId: o.skillId, mode: o.mode, completesAtWorld: 0 } }, centre).skills) - before + roleBonus(o.skillId),
        }))
        .sort((a, b) => b.gain - a.gain || Number(b.o.mode === 'refine') - Number(a.o.mode === 'refine') || a.o.cost - b.o.cost)[0]
      if (best && this.try({ type: 'TRAIN_SKILL', heroId: h.id, skillId: best.o.skillId })) {
        started++
        if (roleBonus(best.o.skillId) > 0) {
          this.lever('TRAIN_ROLE')
          if (HEAL_SKILLS.includes(best.o.skillId)) needHeal = false
          if (TANK_SKILLS.includes(best.o.skillId)) needTank = false
        }
      }
    }
  }

  /**
   * Raids, once a day: the lowest cleared anchor whose chest still waits this week, and only
   * when each of three parties outguns the anchor by RAID_MARGIN (it is the tower:
   * permadeath). Rested fighters only; the crew favours archers and the altar-holders.
   */
  private raid(day: number): void {
    if (this.lastRaidDay === day) return
    const wm = TUNING.tower.worldMult[this.s.worldGrade]
    const fit = living(this.s)
      .filter((h) => fitToFight(h) && !refusesDeploy(this.s, h.id) && h.sanity >= 60)
      .sort((a, b) => heroCp(b, this.s) - heroCp(a, this.s))
    if (fit.length < 3 * SIZE + 1) return
    for (const floor of raidsOpen(this.s)) {
      if (!raidChestReady(this.s, floor, this.now)) continue
      const parties = [0, 1, 2].map((i) => fit.slice(i * SIZE, (i + 1) * SIZE))
      const weakest = Math.min(...parties.map((p) => p.reduce((a, h) => a + heroCp(h, this.s), 0)))
      if (weakest < RAID_MARGIN * floorPower(floor, wm)) continue
      const crew = fit
        .slice(3 * SIZE)
        .sort((a, b) => crewValue(b) - crewValue(a))
        .slice(0, 3)
      const ids = parties.map((p) => p.map((h) => h.id))
      const crewIds = crew.map((h) => h.id)
      if (raidRefusal(this.s, floor, ids, crewIds) !== null) continue
      const clears = raidRecord(this.s, floor).clears
      const alive = living(this.s).length
      if (!this.try({ type: 'TOWER_RAID', floor, parties: ids, crew: crewIds, ballista: 0.6 })) return
      this.lastRaidDay = day
      if (raidRecord(this.s, floor).clears > clears) this.lever('RAID_CLEAR')
      this.lever('RAID_DEATHS', alive - living(this.s).length)
      return
    }
  }

  /** The weekly Crack trial (a simulation: nothing to lose): one go a day with the best legal team. */
  private trial(day: number): void {
    if (this.lastTrialDay === day || !weeklyUnlocked(this.s) || weeklyAttemptsLeft(this.s, this.now) <= 0) return
    const rule = weeklyRule(worldWeekOf(this.now))
    const team = this.ranked()
      .filter((h) => canEnterTrial(h) && heroAllowed(rule, h) && estateBusy(this.s, h.id) !== 'is out on a bounty')
      .slice(0, rule.maxHeroes)
      .map((h) => h.id)
    if (team.length === 0 || weeklyRefusal(this.s, team, this.now) !== null) return
    if (this.try({ type: 'WEEKLY_TRIAL', heroIds: team })) {
      this.lastTrialDay = day
      this.res.levers.TRIAL_BEST = Math.max(this.res.levers.TRIAL_BEST ?? 0, weeklyFor(this.s, this.now).best)
    }
  }

  /** A tryout duel a day between the next two heroes up (XP for the bench). */
  private duel(day: number): void {
    if (this.lastDuelDay === day) return
    const [a, b] = this.ranked()
      .slice(SIZE, SIZE + 8)
      .filter((h) => available(h) && h.sanity >= 60)
    if (!a || !b || duelRefusal(this.s, a.id, b.id) !== null || this.s.gold < duelPurse(this.s, a.id, b.id) + SPARE_GOLD) return
    if (this.try({ type: 'HOST_DUEL', a: a.id, b: b.id })) this.lastDuelDay = day
  }

  /**
   * The five strongest heroes fit to fight now — counter-picked like a person would after
   * one look at the floor: bring mages against the physically immune, blades against the
   * magic-immune.
   */
  bestFive(): OwnedHero[] {
    const fit = living(this.s)
      .filter((h) => available(h) && h.sanity >= this.p.restSanity && !refusesDeploy(this.s, h.id))
      .sort((a, b) => heroCp(b, this.s) - heroCp(a, this.s))
    const need = this.immunities()
    const picked: OwnedHero[] = []
    const take = (pred: (h: OwnedHero) => boolean, n: number) => {
      for (const h of fit) if (picked.length < SIZE && n > 0 && pred(h) && !picked.includes(h)) (picked.push(h), n--)
    }
    if (need.physical) take((h) => h.heroClass === 'mage', 2)
    if (need.magic) take((h) => h.heroClass !== 'mage', 3)
    take(() => true, SIZE)
    return picked
  }

  private immCache: { floor: number; v: { physical: boolean; magic: boolean } } | null = null
  /** Which damage types the current floor's enemies shrug off. */
  private immunities(): { physical: boolean; magic: boolean } {
    const floor = this.s.tower.currentFloor
    if (this.immCache?.floor === floor) return this.immCache.v
    const v = { physical: false, magic: false }
    if (floor <= TUNING.tower.sliceTopFloor) {
      try {
        for (const w of buildEncounter(this.s, floor).waves)
          for (const u of w.units)
            for (const k of u.keywords) if (k.kind === 'immune') v[k.damageType] = true
      } catch {
        /* an unbuildable floor just means no counter-pick */
      }
    }
    this.immCache = { floor, v }
    return v
  }

  private setParty(): void {
    const five = this.bestFive()
    // Sturdiest two stand front, the frailest two at the back.
    const byBulk = [...five].sort((a, b) => bulk(b, this.s) - bulk(a, this.s))
    const lines: Line[] = ['front', 'front', 'mid', 'back', 'back']
    const slots: (HeroId | null)[] = Array.from({ length: SIZE }, (_, i) => byBulk[i]?.id ?? null)
    this.try({ type: 'SET_PARTY', slots, lines })
    this.try({ type: 'SET_DEFENSE', slots })
  }

  private dailies(): void {
    let guard = 0
    while (dailyUnlocked(this.s) && dailyAttemptsLeft(this.s) > 0 && guard++ < 5) {
      if (!this.try({ type: 'ATTEMPT_DAILY' })) break
    }
  }

  private climb(day: number): void {
    for (let i = 0; i < this.p.attemptsPerSession; i++) {
      if (this.s.tower.event) this.resolveEvent()
      if (this.s.tower.event) return
      const floor = this.s.tower.currentFloor
      if (floor > TUNING.tower.sliceTopFloor) return
      this.setParty()
      // Wait for rest if the fit bench is thin (but a lone starter still climbs).
      if (this.bestFive().length < Math.min(3, living(this.s).filter(available).length) || this.bestFive().length === 0) return
      const partyCp = this.bestFive().reduce((a, h) => a + heroCp(h, this.s), 0)
      const ratio = partyCp / floorPower(floor, TUNING.tower.worldMult[this.s.worldGrade])
      // Retry a floor that beat us only once noticeably stronger (more so after a wipe) —
      // or, after a week stuck, at no weaker than last time. Nobody feeds a party to a wall
      // every other day.
      const ll = this.lastLoss
      // A forecast bot reads the crystal instead of guessing from CP (below).
      if (ll && ll.floor === floor && !this.p.forecast) {
        const stronger = ratio >= ll.ratio * (ll.wiped ? 1.2 : 1.1)
        const patient = day - ll.day >= 7 && ratio >= ll.ratio
        if (!stronger && !patient) return
      }
      const ballista = ANCHORS[floor]?.minigame === 'ballista' ? 0.6 : undefined
      const subvert = floor === 90 && this.s.tower.hiddenFound.length >= TUNING.lifecycle.subvertTruths ? true : undefined
      // The deploy rails refuse a floor no one is fit to fight (no attempt is spent); a
      // person sees the Enter sheet say so and waits rather than knocking.
      const pre = reduce(this.s, { type: 'TICK' }, this.now)
      if (fitCount(pre) === 0) {
        this.lever('NOBODY_FIT')
        return
      }
      if (this.p.forecast && !this.forecastSaysGo(pre, floor, day, ballista, subvert)) return
      let out
      try {
        out = attemptFloorWithResult(pre, undefined, ballista, subvert)
        // A fight going badly: call the retreat as the first hero staggers (combat is
        // deterministic, so re-resolving with the order replays the fight up to it — the
        // same revise the battle screen does).
        const lost = out.result.fallenHeroIds.length
        const tick = this.p.retreat && !out.result.cleared && lost > 0 ? retreatTick(out.result.result.log) : null
        if (tick !== null) {
          const orders: BattleOrder[] = [{ tick, kind: 'retreat' }]
          const alt = attemptFloorWithResult(pre, undefined, ballista, subvert, orders)
          if (alt.result.fallenHeroIds.length < lost) {
            out = alt
            this.lever('RETREAT')
            this.lever('RETREAT_SAVED', lost - alt.result.fallenHeroIds.length)
          }
        }
      } catch {
        this.res.refusals.ATTEMPT_FLOOR = (this.res.refusals.ATTEMPT_FLOOR ?? 0) + 1
        return
      }
      this.onAttempt?.(this.s, out.result)
      this.s = out.state
      const r = out.result
      this.res.attempts[floor] = (this.res.attempts[floor] ?? 0) + 1
      if (r.fallenHeroIds.length) this.res.deaths[floor] = (this.res.deaths[floor] ?? 0) + r.fallenHeroIds.length
      if (r.firstClear) this.res.firstClearDay[floor] = day
      if (r.worldEnded) this.res.worldEnded = true
      if (r.worldSaved) this.res.worldSaved = true
      this.res.log.push({ day, floor, ratio: Math.round(ratio * 100) / 100, won: r.cleared, fallen: r.fallenHeroIds.length })
      if (!r.cleared) {
        this.lastLoss = { floor, ratio, day, wiped: r.result.outcome === 'wipe' }
        return
      }
      this.lastLoss = null
      this.sideRoom()
    }
  }

  /**
   * The war room (lane C): run the real fight in the crystal and enter on good odds — at least
   * FORECAST_ENTER_WIN % to clear at under FORECAST_ENTER_DEATHS heroes an attempt. Otherwise
   * wait (the bench trains, the camp rests, the gear improves); after a week stuck on the
   * floor, go anyway, as a person would.
   */
  private forecastSaysGo(pre: GameState, floor: number, day: number, ballista?: number, subvert?: boolean): boolean {
    const f = forecastFloor(pre, { ballista, subvert })
    if (!f || f.fielded === 0) return true
    if (f.winPct >= FORECAST_ENTER_WIN && f.expectedDeaths < FORECAST_ENTER_DEATHS) {
      this.waitingSince = null
      return true
    }
    if (this.waitingSince?.floor !== floor) this.waitingSince = { floor, day }
    if (day - this.waitingSince.day >= FORECAST_PATIENCE_DAYS) {
      this.lever('FORECAST_DARED')
      return true
    }
    this.lever('FORECAST_WAIT')
    return false
  }

  /** Tower challenges: an engaged player walks through the side door an anchor revealed. */
  private sideRoom(): void {
    if (!this.p.crack) return
    const room = challengeOf(this.s).room
    if (!room) return
    const wants: Record<BonusRoomKind, string[]> = {
      vault: ['take'],
      lostHero: ['accept'],
      training: ['train'],
      mimic: ['fight'],
      shrine: this.avgSanity() >= 70 ? ['accept'] : [],
      merchant: this.s.gold > 50_000 ? ['stones', 'rank', 'gear', 'attr'] : [],
    }
    for (const c of wants[room.kind]) this.try({ type: 'BONUS_ROOM', choice: c })
    if (challengeOf(this.s).room) this.try({ type: 'BONUS_ROOM', choice: 'leave' })
  }

  private rift(): void {
    if (!this.s.meta.crackOpen) {
      if (crackRefusal(this.s) === null) this.try({ type: 'OPEN_CRACK' })
      return
    }
    const party = new Set(this.s.party.slots.filter(Boolean))
    const bench = living(this.s)
      .filter((h) => available(h) && !party.has(h.id) && !refusesDeploy(this.s, h.id))
      .sort((a, b) => heroCp(b, this.s) - heroCp(a, this.s))
      .slice(0, TUNING.rift.maxTeam)
      .map((h) => h.id)
    if (bench.length > 0 && dispatchRefusal(this.s, bench) === null) this.try({ type: 'DISPATCH_RUINS', heroIds: bench })
  }

  avgSanity(): number {
    const five = living(this.s).filter(available)
    if (five.length === 0) return 0
    return five.reduce((a, h) => a + h.sanity, 0) / five.length
  }

  sample(day: number): DaySample {
    const s = this.s
    const all = Object.values(s.heroes) as OwnedHero[]
    const top = living(s)
      .map((h) => heroCp(h, s))
      .sort((a, b) => b - a)
      .slice(0, SIZE)
    return {
      day,
      highestCleared: s.tower.highestCleared,
      gold: s.gold,
      gems: s.gems,
      alive: all.filter((h) => h.alive).length,
      deaths: all.filter((h) => !h.alive).length - (this.res.levers.SACRIFICED ?? 0),
      topCp: Math.round(top.reduce((a, b) => a + b, 0)),
      nextFloorPower: Math.round(floorPower(Math.min(s.tower.currentFloor, TUNING.tower.sliceTopFloor), TUNING.tower.worldMult[s.worldGrade])),
      masterLevel: s.meta.masterLevel,
      avgSanity: Math.round(this.avgSanity()),
      spentUsd: Math.round(s.meta.wallet.spentUsd * 100) / 100,
      pi: Math.round(s.meta.pi),
      advPulls: s.gacha.advPullCount,
    }
  }
}

function bulk(h: OwnedHero, s: GameState): number {
  const cls = h.heroClass
  const role = cls === 'warrior' || cls === 'spearman' ? 2 : cls === 'thief' ? 1 : 0
  return role * 1e6 + heroCp(h, s)
}

/** Ballista crew value: archers aim truer, a light hero or a mage holds the altar. */
function crewValue(h: OwnedHero): number {
  return (h.heroClass === 'archer' ? 2 : 0) + (h.element === 'light' || h.heroClass === 'mage' ? 1 : 0)
}

/** Attributes whose growth grade a transfer synthesis from `sac` would raise on `survivor`. */
function gradeGain(survivor: OwnedHero, sac: OwnedHero): number {
  let n = 0
  for (const k of ['str', 'agi', 'vit', 'int', 'wil'] as const) if (sac.growthGrades[k] > survivor.growthGrades[k]) n++
  return n
}

/**
 * When a watching Master would call the retreat in a fight the party is losing: the beat
 * after the first hero drops below a third of their HP (or falls outright).
 */
export function retreatTick(log: CombatLog): number | null {
  const maxHp = new Map(log.unitsInit.filter((u) => u.side === 'hero').map((u) => [u.id, u.maxHP]))
  for (const e of log.events) {
    if (e.kind === 'hit' && maxHp.has(e.targetId) && e.hpAfter < maxHp.get(e.targetId)! / 3) return e.tick + 1
    if (e.kind === 'death' && maxHp.has(e.unitId)) return e.tick + 1
  }
  return null
}

const GRADES = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS']
function gradeRank(g: string): number {
  return GRADES.indexOf(g)
}

/** Called with the state just before each floor attempt and what the attempt did (for analysis tools). */
export type AttemptHook = (before: GameState, result: FloorResult) => void

/** Play `days` real days as `profile`. Deterministic for a given seed. */
export function simulate(profileId: ProfileId, seed: number, days: number, onAttempt?: AttemptHook): SimResult {
  return run(profileId, seed, days, REAL_EPOCH, onAttempt).res
}

/**
 * Play `days` real days as `profile` starting at `epoch` and hand back the account
 * itself (a mid-game save for playtesting: `npm run mksave`).
 */
export function playAccount(profileId: ProfileId, seed: number, days: number, epoch: number): GameState {
  return run(profileId, seed, days, epoch).s
}

function run(profileId: ProfileId, seed: number, days: number, epoch: number, onAttempt?: AttemptHook): Bot {
  const p = PROFILES[profileId]
  const bot = new Bot(p, seed, onAttempt, epoch)
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < p.sessionsPerDay; k++) {
      // Sessions spread across the waking hours (08:00–23:00).
      const hour = 8 + (15 * k) / Math.max(1, p.sessionsPerDay - 1)
      bot.session(epoch + d * REAL_DAY_MS + hour * 3_600_000, d)
      if (bot.s.meta.deleted) break
    }
    bot.res.days.push(bot.sample(d))
    if (bot.s.meta.deleted) {
      bot.res.deleted = true
      break
    }
    if (bot.s.tower.highestCleared >= TUNING.tower.sliceTopFloor) break
  }
  bot.res.captiveLosses = bot.s.pvp.log.filter((l) => l.note.startsWith('synthesized')).length
  return bot
}

/** World-day index helper re-exported for reports. */
export { worldDayIndex }
