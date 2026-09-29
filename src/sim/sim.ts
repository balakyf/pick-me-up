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
import type { GameState, HeroId, Line, OwnedHero, EquipmentSlot, Command, FloorResult } from '../engine/types'
import { reduce, attemptFloorWithResult } from '../engine/store'
import { toWorldTime } from '../engine/time'
import { combatPowerForHero } from '../engine/stats'
import { skillCp } from '../engine/skills'
import { engravingCp } from '../engine/engravings'
import { canPromote, canAfford } from '../engine/promotion'
import { canUpgrade } from '../engine/facilities'
import { dailyUnlocked, dailyAttemptsLeft, worldDayIndex } from '../engine/daily'
import { banquetWouldHelp } from '../engine/kitchen'
import { canCraft, equippedItemIds } from '../engine/equipment'
import { floorPower, buildEncounter } from '../engine/tower'
import { ANCHORS } from '../engine/content'
import { loginClaimed, packageRefusal } from '../engine/shop'
import { crackRefusal, dispatchRefusal } from '../engine/rift'
import { GIFTS, giftDelta } from '../engine/favor'

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
  },
}

/** One end-of-day snapshot. */
export interface DaySample {
  day: number
  highestCleared: number
  gold: number
  gems: number
  alive: number
  deaths: number
  /** Sum of the five strongest living heroes' CP. */
  topCp: number
  /** The target power budget of the next floor. */
  nextFloorPower: number
  masterLevel: number
  avgSanity: number
  spentUsd: number
  pi: number
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
}

const REAL_DAY_MS = 86_400_000
/** A fixed real-time epoch so runs never depend on the wall clock. */
const REAL_EPOCH = Date.UTC(2026, 0, 5)
const SIZE = TUNING.account.partySize

export function heroCp(h: OwnedHero): number {
  return combatPowerForHero(h, h.xp.level, skillCp(h.skills) + engravingCp(h.engraving))
}

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
  /** After a loss, the party strength and day it happened (a person waits to get stronger). */
  private lastLoss: { floor: number; ratio: number; day: number; wiped: boolean } | null = null

  constructor(
    readonly p: Profile,
    seed: number,
    readonly onAttempt?: AttemptHook,
  ) {
    this.s = reduce(null, { type: 'NEW_ACCOUNT', seed, now: REAL_EPOCH })
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
    }
  }

  /** Dispatch; a refusal is counted and swallowed (the bot's guess was wrong, the game is fine). */
  try(cmd: Command): boolean {
    try {
      this.s = reduce(this.s, cmd, this.now)
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
    this.buildFacilities()
    this.promote()
    this.summon()
    if (this.p.equipment) this.forge()
    if (this.p.gifts) this.gifts()
    if (this.p.guild) this.guild()
    this.rescueCaptives()
    this.feast()
    this.setParty()
    if (this.p.dailies) this.dailies()
    this.climb(day)
    if (this.p.crack) this.rift()
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
    const weeks = Math.floor((this.now - toWorldTime(REAL_EPOCH)) / (7 * 3 * REAL_DAY_MS)) + 1
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
  }

  private promote(): void {
    for (const h of living(this.s)) {
      if (available(h) && canPromote(h) && canAfford(this.s, h)) this.try({ type: 'PROMOTE_HERO', heroId: h.id })
    }
  }

  private summon(): void {
    const cost = TUNING.gacha.normalCostGold
    // A casual player keeps a small bench; the engaged keep pulling while gold is spare.
    const cap = this.p.id === 'casual' ? 15 : 40
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
    guard = 0
    while (guard++ < 10) {
      if (this.s.gems >= adv.tenPullGems) {
        if (!this.try({ type: 'SUMMON', pool: 'advanced', count: 10 })) break
      } else if (this.p.usdPerWeek > 0 && this.s.gems >= adv.costGems) {
        if (!this.try({ type: 'SUMMON', pool: 'advanced', count: 1 })) break
      } else break
    }
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
          .filter((i) => i.slot === slot && !worn.has(i.id) && (i.exclusiveTo === undefined || i.exclusiveTo === h.id))
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
    if (this.avgSanity() < 55 && banquetWouldHelp(this.s) && this.s.gold >= TUNING.lobby.banquet.gold * 3) this.try({ type: 'BANQUET' })
  }

  /**
   * The five strongest heroes fit to fight now — counter-picked like a person would after
   * one look at the floor: bring mages against the physically immune, blades against the
   * magic-immune.
   */
  bestFive(): OwnedHero[] {
    const fit = living(this.s)
      .filter((h) => available(h) && h.sanity >= this.p.restSanity)
      .sort((a, b) => heroCp(b) - heroCp(a))
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
    const byBulk = [...five].sort((a, b) => bulk(b) - bulk(a))
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
      const partyCp = this.bestFive().reduce((a, h) => a + heroCp(h), 0)
      const ratio = partyCp / floorPower(floor, TUNING.tower.worldMult[this.s.worldGrade])
      // Retry a floor that beat us only once noticeably stronger (more so after a wipe) —
      // or, after a week stuck, at no weaker than last time. Nobody feeds a party to a wall
      // every other day.
      const ll = this.lastLoss
      if (ll && ll.floor === floor) {
        const stronger = ratio >= ll.ratio * (ll.wiped ? 1.2 : 1.1)
        const patient = day - ll.day >= 7 && ratio >= ll.ratio
        if (!stronger && !patient) return
      }
      const ballista = ANCHORS[floor]?.minigame === 'ballista' ? 0.6 : undefined
      const subvert = floor === 90 && this.s.tower.hiddenFound.length >= TUNING.lifecycle.subvertTruths ? true : undefined
      let out
      try {
        out = attemptFloorWithResult(reduce(this.s, { type: 'TICK' }, this.now), undefined, ballista, subvert)
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
    }
  }

  private rift(): void {
    if (!this.s.meta.crackOpen) {
      if (crackRefusal(this.s) === null) this.try({ type: 'OPEN_CRACK' })
      return
    }
    const party = new Set(this.s.party.slots.filter(Boolean))
    const bench = living(this.s)
      .filter((h) => available(h) && !party.has(h.id))
      .sort((a, b) => heroCp(b) - heroCp(a))
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
      .map(heroCp)
      .sort((a, b) => b - a)
      .slice(0, SIZE)
    return {
      day,
      highestCleared: s.tower.highestCleared,
      gold: s.gold,
      gems: s.gems,
      alive: all.filter((h) => h.alive).length,
      deaths: all.filter((h) => !h.alive).length,
      topCp: Math.round(top.reduce((a, b) => a + b, 0)),
      nextFloorPower: Math.round(floorPower(Math.min(s.tower.currentFloor, TUNING.tower.sliceTopFloor), TUNING.tower.worldMult[s.worldGrade])),
      masterLevel: s.meta.masterLevel,
      avgSanity: Math.round(this.avgSanity()),
      spentUsd: Math.round(s.meta.wallet.spentUsd * 100) / 100,
      pi: Math.round(s.meta.pi),
    }
  }
}

function bulk(h: OwnedHero): number {
  const cls = h.heroClass
  const role = cls === 'warrior' || cls === 'spearman' ? 2 : cls === 'thief' ? 1 : 0
  return role * 1e6 + heroCp(h)
}

const GRADES = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS']
function gradeRank(g: string): number {
  return GRADES.indexOf(g)
}

/** Called with the state just before each floor attempt and what the attempt did (for analysis tools). */
export type AttemptHook = (before: GameState, result: FloorResult) => void

/** Play `days` real days as `profile`. Deterministic for a given seed. */
export function simulate(profileId: ProfileId, seed: number, days: number, onAttempt?: AttemptHook): SimResult {
  const p = PROFILES[profileId]
  const bot = new Bot(p, seed, onAttempt)
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < p.sessionsPerDay; k++) {
      // Sessions spread across the waking hours (08:00–23:00).
      const hour = 8 + (15 * k) / Math.max(1, p.sessionsPerDay - 1)
      bot.session(REAL_EPOCH + d * REAL_DAY_MS + hour * 3_600_000, d)
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
  return bot.res
}

/** World-day index helper re-exported for reports. */
export { worldDayIndex }
