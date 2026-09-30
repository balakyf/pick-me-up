/**
 * Quanton Life — the Living Lobby's simulation (spec 2026-09-30 §1–2).
 *
 * Heroes live in 30-world-minute slots. At each slot boundary an idle hero picks the
 * activity with the best utility (needs × personality × schedule × job × grief), walks to
 * the place it happens, and does it: sleeping in the dormitory, eating in the kitchen,
 * working the forge, sparring in the yard, drinking in the tavern, mourning at the
 * memorial. Heroes who share a place get to know each other; friendships, rivalries and
 * grief follow. Workers produce: smiths forge the Master's work order, cooks fill the
 * pantry, scholars study the next floor, gardeners and merchants earn gold, instructors
 * multiply training XP, healers mend the broken, guards stiffen the invasion defense.
 *
 * PURE and deterministic: every roll comes from floatStream(seed, 'life', slot, …). The
 * clock is absolute (slot = ⌊worldMs / slotMs⌋), so many short advances equal one long
 * one. A long absence is simulated for at most `maxCatchUpSlots`; older time just passes.
 */
import { TUNING } from '../tuning'
import { floatStream } from '../rng'
import { applyXp, xpToNext } from '../stats'
import { forgeCost, forgeGrade, statBlockFor, itemName, smithyUnlocked } from '../equipment'
import type {
  ActivityKind,
  ChronicleEntry,
  EquipmentGrade,
  EquipmentId,
  EquipmentItem,
  EquipmentSlot,
  GameState,
  HeroActivity,
  HeroId,
  HeroLife,
  LifePlace,
  LifeState,
  Memory,
  NeedKey,
  OwnedHero,
  Relation,
  XpProgress,
} from '../types'
import { personalityOf, chemistry, type Personality } from './personality'
import { JOB_PLACE, jobOpen, jobTier, workPower, aptitude, jobFeeling } from './jobs'
import { activityNudge, estateLifeMods, estateLive, instructorMult, type EstateLifeMods } from '../estate/lifeHooks'
import { weatherAt, type Weather } from '../estate/weather'

const L = TUNING.life
const R = L.relation

// ─────────────────────────────────────────────────────────────────────────────
// Clock
// ─────────────────────────────────────────────────────────────────────────────

export function slotOf(worldMs: number): number {
  return Math.floor(worldMs / L.slotMs)
}
export function dayOfSlot(slot: number): number {
  return Math.floor(slot / L.slotsPerDay)
}
/** Hour of the world-day, 0..23.5 in half hours. */
export function hourOfSlot(slot: number): number {
  return (((slot % L.slotsPerDay) + L.slotsPerDay) % L.slotsPerDay) / 2
}
/** Hour of the world-day for a world-time (for the UI's lighting). */
export function hourOfWorld(worldMs: number): number {
  const dayMs = L.slotsPerDay * L.slotMs
  return ((((worldMs % dayMs) + dayMs) % dayMs) / dayMs) * 24
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

export function defaultLifeState(nowWorld: number): LifeState {
  return {
    slot: slotOf(nowWorld),
    relations: {},
    chronicle: [],
    memorial: [],
    pantry: 0,
    forge: { order: null, wip: null },
    research: { floor: 1, points: 0 },
    guardPower: 0,
    tally: { jobGold: 0, meals: 0, forged: 0, trainXp: 0, research: 0, healed: 0 },
    letterReadAt: nowWorld,
    guide: { tutorialPull: false, done: [] },
    crystal: { day: -1, advancedPulls: 0 },
  }
}

export function newHeroLife(day: number): HeroLife {
  return {
    needs: { energy: 80, hunger: 75, social: 60, fun: 60 },
    job: null,
    jobXp: {},
    doing: { kind: 'wander', place: 'hall', untilSlot: 0 },
    memories: [{ kind: 'firstDay', day, weight: 50 }],
    grief: 0,
    arrivedDay: day,
    bestFloor: 0,
  }
}

/** A hero's life, or a fresh one for a hero the clock has not seen yet. */
export function lifeOf(hero: OwnedHero): HeroLife {
  return hero.life ?? newHeroLife(0)
}

export function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function relationOf(state: GameState, a: string, b: string): Relation | null {
  return state.life.relations[relationKey(a, b)] ?? null
}

export type Bond = 'closeFriend' | 'friend' | 'rival' | 'grudge' | null
export function bondOf(affinity: number): Bond {
  if (affinity >= R.closeFriend) return 'closeFriend'
  if (affinity >= R.friend) return 'friend'
  if (affinity <= R.grudge) return 'grudge'
  if (affinity <= R.rival) return 'rival'
  return null
}

/** A hero's relations, strongest first: [otherId, relation]. */
export function relationsOf(state: GameState, heroId: string): [HeroId, Relation][] {
  const out: [HeroId, Relation][] = []
  for (const [k, r] of Object.entries(state.life.relations)) {
    const [a, b] = k.split('|') as [HeroId, HeroId]
    if (a === heroId) out.push([b, r])
    else if (b === heroId) out.push([a, r])
  }
  return out.sort((x, y) => Math.abs(y[1].affinity) - Math.abs(x[1].affinity))
}

/** Beds in the dormitory. */
export function bedCount(state: GameState): number {
  return L.beds.base + L.beds.perLevel * state.facilities.dormitory.level
}

const livingOrder = new WeakMap<GameState['heroes'], Map<string, number>>()

/** Bed index per living hero (earliest arrivals first); null = sleeps in the hall. */
export function bedIndex(state: GameState, heroId: string): number | null {
  let order = livingOrder.get(state.heroes)
  if (!order) {
    order = new Map()
    let n = 0
    for (const id of Object.keys(state.heroes)) if (state.heroes[id as HeroId]!.alive) order.set(id, n++)
    livingOrder.set(state.heroes, order)
  }
  const i = order.get(heroId)
  return i !== undefined && i < bedCount(state) ? i : null
}

/** Memories ranked by salience (weight fading ~2/day). */
export function salientMemories(life: HeroLife, today: number): Memory[] {
  return [...life.memories].sort((a, b) => b.weight - (today - b.day) * 2 - (a.weight - (today - a.day) * 2))
}

export function addMemory(life: HeroLife, m: Memory): void {
  // Small grievances with the same person blur into one memory (the latest).
  if (m.kind === 'argued') life.memories = life.memories.filter((x) => !(x.kind === 'argued' && x.other === m.other))
  life.memories.push(m)
  if (life.memories.length > L.memories.max) {
    const today = m.day
    let worst = 0
    let worstScore = Infinity
    for (let i = 0; i < life.memories.length; i++) {
      const x = life.memories[i]!
      // The first day is never forgotten.
      const score = x.kind === 'firstDay' ? Infinity : x.weight - (today - x.day) * 2
      if (score < worstScore) {
        worstScore = score
        worst = i
      }
    }
    life.memories.splice(worst, 1)
  }
}

function pushChronicle(list: ChronicleEntry[], e: ChronicleEntry): void {
  list.push(e)
  if (list.length > L.chronicleMax) list.splice(0, list.length - L.chronicleMax)
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity choice (utility AI)
// ─────────────────────────────────────────────────────────────────────────────

/** Is `hour` inside this chronotype's night? */
export function isSleepHour(hour: number, p: Personality): boolean {
  const [start, end] = p.chronotype === 'early' ? [21, 5] : p.chronotype === 'owl' ? [1, 9] : [23, 7]
  return start > end ? hour >= start || hour < end : hour >= start && hour < end
}

function wakeHour(p: Personality): number {
  return p.chronotype === 'early' ? 5 : p.chronotype === 'owl' ? 9 : 7
}

function slotsUntilHour(hour: number, target: number): number {
  let d = target - hour
  if (d <= 0) d += 24
  return Math.max(1, Math.round(d * 2))
}

function isWorkHour(hour: number, job: HeroLife['job']): boolean {
  if (job === 'guard') return hour >= 6 && hour < 22
  return hour >= L.hours.workStart && hour < L.hours.workEnd
}

function isMealHour(hour: number): boolean {
  return (L.hours.meals as readonly number[]).some((m) => hour >= m && hour < m + 1)
}

interface Ctx {
  state: GameState
  slot: number
  hour: number
  forgeHasWork: boolean
  /** Heroes already headed to each place this slot (crowding). */
  crowd: Map<LifePlace, number>
  /** The estate (decorations, trauma, bounties) and the sky overhead. */
  mods: EstateLifeMods
  weather: Weather
}

/** How many heroes a place holds comfortably before it feels crowded. */
export function placeCapacity(place: LifePlace, st: GameState): number {
  const f = st.facilities
  switch (place) {
    case 'tavern':
      return 5 + 3 * f.tavern.level
    case 'kitchen':
      return 6 + 3 * f.kitchen.level
    case 'library':
      return 3 + 2 * f.library.level
    case 'yard':
      return 10
    case 'garden':
      return 4 + 2 * f.garden.level
    case 'hall':
      return 14
    case 'infirmary':
      return 4 * Math.max(1, f.infirmary.level)
    case 'dormitory':
      return 999
    default:
      return 8
  }
}

function hobbyPlace(p: Personality, st: GameState): LifePlace {
  const f = st.facilities
  switch (p.hobby) {
    case 'gardening':
      return f.garden.level > 0 ? 'garden' : 'courtyard'
    case 'reading':
      return f.library.level > 0 ? 'library' : 'hall'
    case 'sparring':
      return 'yard'
    case 'music':
      return f.tavern.level > 0 ? 'tavern' : 'courtyard'
    case 'cards':
      return f.tavern.level > 0 ? 'tavern' : 'hall'
    case 'cooking':
      return 'kitchen'
    default:
      return 'courtyard'
  }
}

/** Where an activity happens for this hero right now. */
export function placeFor(kind: ActivityKind, hero: OwnedHero, life: HeroLife, st: GameState): LifePlace {
  const f = st.facilities
  switch (kind) {
    case 'sleep':
      return bedIndex(st, hero.id) !== null && f.dormitory.level > 0 ? 'dormitory' : 'hall'
    case 'eat':
      return 'kitchen'
    case 'work':
      return life.job ? JOB_PLACE[life.job] : 'hall'
    case 'train':
      return 'yard'
    case 'socialize':
      return f.tavern.level > 0 ? 'tavern' : 'hall'
    case 'hobby':
      return hobbyPlace(personalityOf(hero), st)
    case 'read':
      return f.library.level > 0 ? 'library' : 'hall'
    case 'pray':
      return f.promotionChamber.level > 0 ? 'promotion' : 'hall'
    case 'mourn':
      return 'memorial'
    case 'heal':
      return 'infirmary'
    case 'promoting':
      return 'promotion'
    case 'drilling':
      return 'yard'
    case 'away':
    case 'captive':
      return 'offsite'
    default:
      return 'courtyard'
  }
}

/** Activities another system pins the hero to (they cannot choose). */
function pinned(hero: OwnedHero): ActivityKind | null {
  if (hero.captiveOf) return 'captive'
  if (hero.expedition) return 'away'
  if (hero.promotion) return 'promoting'
  if (hero.training) return 'drilling'
  return null
}

const need01 = (v: number) => (100 - v) / 100

function chooseActivity(hero: OwnedHero, life: HeroLife, ctx: Ctx, rnd: () => number): { kind: ActivityKind; slots: number } {
  const p = personalityOf(hero)
  const n = life.needs
  const hour = ctx.hour
  const night = isSleepHour(hour, p)
  // Collapsing with exhaustion trumps everything.
  if (n.energy < 8) return { kind: 'sleep', slots: night ? slotsUntilHour(hour, wakeHour(p)) : 4 }
  const f = ctx.state.facilities
  const scores: [ActivityKind, number][] = []
  scores.push(['sleep', need01(n.energy) * 1.5 + (night ? 2.6 : -1.2)])
  if (!night || n.hunger < 20) scores.push(['eat', need01(n.hunger) * 1.7 + (isMealHour(hour) ? 0.8 : 0) - (n.hunger > 75 ? 2 : 0)])
  if (life.job && jobOpen(ctx.state, life.job) && isWorkHour(hour, life.job) && !night) {
    const feel = jobFeeling(hero, life.job)
    const blocked = life.job === 'blacksmith' && !ctx.forgeHasWork
    if (!blocked) scores.push(['work', 1.3 + p.diligence * 0.9 + (feel === 'likes' ? 0.3 : feel === 'dislikes' ? -0.4 : 0) - (n.energy < 25 ? 1 : 0)])
  }
  if (!night) {
    scores.push(['train', 0.1 + p.diligence * 0.5 + p.courage * 0.15 - (hero.xp.atCap ? 0.8 : 0)])
    scores.push(['socialize', need01(n.social) * 1.4 + p.sociability * 0.6 + (hour >= L.hours.evening ? 0.5 : 0)])
    scores.push(['hobby', need01(n.fun) * 1.2 + 0.45])
    scores.push(['read', p.curiosity * 0.8 + need01(n.fun) * 0.4 - (f.library.level > 0 ? 0 : 0.3)])
    scores.push(['wander', 0.3 + p.curiosity * 0.3])
    if (hero.sanity < 50) scores.push(['pray', ((50 - hero.sanity) / 50) * 1.2])
    if (life.grief > 0) scores.push(['mourn', (life.grief / 100) * 1.8 + p.warmth * 0.3])
    if (hero.sanity < 35 && f.infirmary.level > 0) scores.push(['heal', 1.4 + ((35 - hero.sanity) / 35) * 0.8])
  }
  let best: ActivityKind = 'wander'
  let bestScore = -Infinity
  for (const [k, s] of scores) {
    // A full room is less inviting: every hero past its capacity costs a little.
    const place = placeFor(k, hero, life, ctx.state)
    const over = (ctx.crowd.get(place) ?? 0) - placeCapacity(place, ctx.state)
    const v = s + rnd() * 0.35 - (over > 0 && k !== 'work' && k !== 'sleep' ? 0.25 * over : 0) + activityNudge(ctx.mods, hero.id, k, place, ctx.weather)
    if (v > bestScore) {
      bestScore = v
      best = k
    }
  }
  const slots =
    best === 'sleep'
      ? night
        ? slotsUntilHour(hour, wakeHour(p))
        : 2
      : best === 'eat'
        ? 1
        : best === 'work'
          ? 4
          : best === 'wander' || best === 'pray' || best === 'mourn'
            ? 1 + Math.floor(rnd() * 2)
            : 2 + Math.floor(rnd() * 2)
  return { kind: best, slots }
}

// ─────────────────────────────────────────────────────────────────────────────
// The forge (the smiths' shared work order)
// ─────────────────────────────────────────────────────────────────────────────

const GRADES: EquipmentGrade[] = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS']

function gradeIdx(g: EquipmentGrade): number {
  return GRADES.indexOf(g)
}

/** What the 'auto' order would forge next: a party slot that is empty or below the forge
 *  grade with no spare item to fill it. Null = nothing needed. */
export function autoForgeSlot(state: GameState): EquipmentSlot | null {
  const grade = forgeGrade(state.meta.masterLevel)
  const byId = new Map(state.inventory.map((i) => [i.id, i]))
  const equipped = new Set<string>()
  for (const h of Object.values(state.heroes)) for (const id of Object.values(h.equipment)) if (id) equipped.add(id)
  const spare = (slot: EquipmentSlot) =>
    state.inventory.some((i) => i.slot === slot && !equipped.has(i.id) && !i.exclusiveTo && gradeIdx(i.grade) >= gradeIdx(grade))
  for (const slot of ['weapon', 'armor', 'accessory'] as EquipmentSlot[]) {
    if (spare(slot)) continue
    for (const id of state.party.slots) {
      const h = id ? state.heroes[id] : null
      if (!h || !h.alive) continue
      const cur = h.equipment[slot] ? byId.get(h.equipment[slot]!) : undefined
      if (!cur || gradeIdx(cur.grade) < gradeIdx(grade)) return slot
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// The step
// ─────────────────────────────────────────────────────────────────────────────

export interface Working {
  hero: OwnedHero
  life: HeroLife
  sanity: number
  xp: XpProgress
  p: Personality
}

const clamp = (v: number, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v)

function cloneLife(l: HeroLife): HeroLife {
  return { ...l, needs: { ...l.needs }, jobXp: { ...l.jobXp }, doing: { ...l.doing }, memories: [...l.memories] }
}

/**
 * Advance the Living Lobby to world-time `nowWorld`. Returns the same reference when no
 * slot boundary was crossed.
 */
export function stepLife(state: GameState, nowWorld: number): GameState {
  const target = slotOf(nowWorld)
  let from = state.life.slot
  if (target <= from) return state
  let skipped = false
  if (target - from > L.maxCatchUpSlots) {
    from = target - L.maxCatchUpSlots
    skipped = true
  }

  const work: Working[] = []
  const byId = new Map<string, Working>()
  for (const id of Object.keys(state.heroes) as HeroId[]) {
    const h = state.heroes[id]!
    if (!h.alive) continue
    const life = h.life ? cloneLife(h.life) : newHeroLife(dayOfSlot(from + 1))
    if (skipped) {
      life.needs = { energy: 70, hunger: 70, social: 70, fun: 70 }
      life.doing = { ...life.doing, untilSlot: 0 }
    }
    const w: Working = { hero: h, life, sanity: h.sanity, xp: h.xp, p: personalityOf(h) }
    work.push(w)
    byId.set(id, w)
  }

  const relations: Record<string, Relation> = { ...state.life.relations }
  const chronicle = [...state.life.chronicle]
  let pantry = state.life.pantry
  const forge = { order: state.life.forge.order, wip: state.life.forge.wip ? { ...state.life.forge.wip } : null }
  let research = { ...state.life.research }
  const tally = { ...state.life.tally }
  let gold = state.gold
  let pi = state.meta.pi
  let materials = state.materials
  let inventory = state.inventory
  let peeked = state.meta.peekedFloors
  let guardPower = state.life.guardPower
  const pantryCap = Math.max(4, work.length * L.jobs.pantryPerHero)
  const seed = state.seed
  let lastStallDay = -1
  const mods = estateLifeMods(state)

  for (let slot = from + 1; slot <= target; slot++) {
    const hour = hourOfSlot(slot)
    const day = dayOfSlot(slot)
    const atWorld = slot * L.slotMs
    // The forge has work when an order stands and the smiths can pay for (or already hold) an item.
    const forgeState = { ...state, gold, materials, inventory }
    const orderSlot: EquipmentSlot | null =
      forge.wip?.slot ?? (forge.order === 'auto' ? autoForgeSlot(forgeState) : forge.order)
    const forgeHasWork = smithyUnlocked(state) && forge.order !== null && orderSlot !== null
    const crowd = new Map<LifePlace, number>()
    const ctx: Ctx = { state: forgeState, slot, hour, forgeHasWork, crowd, mods, weather: weatherAt(seed, atWorld) }

    // 1. Decide.
    for (const w of work) {
      const pin = pinned(w.hero) ?? (mods.away.has(w.hero.id) ? 'away' : null)
      if (pin) {
        w.life.doing = { kind: pin, place: placeFor(pin, w.hero, w.life, state), untilSlot: slot + 1 }
        continue
      }
      const d = w.life.doing
      const emergency = w.life.needs.energy < 8 && d.kind !== 'sleep'
      const jobGone = d.kind === 'work' && (!w.life.job || !forgeHasWork && w.life.job === 'blacksmith')
      if (slot >= d.untilSlot || emergency || jobGone || d.kind === 'promoting' || d.kind === 'drilling' || d.kind === 'away' || d.kind === 'captive') {
        const rnd = floatStream(seed, 'life', slot, w.hero.id)
        const c = chooseActivity(w.hero, w.life, ctx, rnd)
        w.life.doing = { kind: c.kind, place: placeFor(c.kind, w.hero, w.life, forgeState), untilSlot: slot + c.slots }
      } else if (d.with) {
        w.life.doing = { ...d, with: undefined }
      }
      crowd.set(w.life.doing.place, (crowd.get(w.life.doing.place) ?? 0) + 1)
    }

    // 2. Work (account-level outputs first: the instructor and healer powers feed step 3).
    let instructorPower = 0
    let healerPower = 0
    guardPower = 0
    let smithPower = 0
    let leadSmith: Working | null = null
    let leadTier = 0
    for (const w of work) {
      if (w.life.doing.kind !== 'work' || !w.life.job) continue
      const job = w.life.job
      const power = workPower(ctx.state, w.hero, job)
      const before = jobTier(w.life.jobXp[job] ?? 0)
      w.life.jobXp[job] = (w.life.jobXp[job] ?? 0) + 1
      const after = jobTier(w.life.jobXp[job]!)
      if (after > before) {
        addMemory(w.life, { kind: 'jobTier', day, detail: `${job}:${after}`, weight: 45 })
        pushChronicle(chronicle, { at: atWorld, kind: 'jobTier', heroIds: [w.hero.id], detail: `${job}:${after}` })
      }
      const feel = jobFeeling(w.hero, job)
      if (feel === 'likes') w.sanity += L.sanity.jobLike
      else if (feel === 'dislikes') w.sanity -= L.sanity.jobDislike
      w.life.doing.stalled = false
      switch (job) {
        case 'blacksmith':
          smithPower += power
          if (!leadSmith || after > leadTier) {
            leadSmith = w
            leadTier = after
          }
          break
        case 'cook':
          pantry = Math.min(pantryCap, pantry + L.jobs.cookMeals * power)
          break
        case 'gardener': {
          const g = Math.round(L.jobs.gardenerGold * power)
          gold += g
          tally.jobGold += g
          pantry = Math.min(pantryCap, pantry + L.jobs.gardenerPantry * power)
          break
        }
        case 'merchant': {
          const g = Math.round(L.jobs.merchantGold * power)
          gold += g
          tally.jobGold += g
          break
        }
        case 'scholar': {
          const floor = state.tower.currentFloor
          if (research.floor !== floor) research = { floor, points: 0 }
          research.points += L.jobs.scholarResearch * power
          pi += L.jobs.scholarPi * power
          if (research.points >= L.jobs.researchToStudy && !peeked.includes(floor)) {
            peeked = [...peeked, floor].sort((a, b) => a - b)
            tally.research++
            pushChronicle(chronicle, { at: atWorld, kind: 'research', heroIds: [w.hero.id], floor })
          }
          break
        }
        case 'instructor':
          instructorPower += power * instructorMult(mods, w.hero.id)
          break
        case 'healer':
          healerPower += power
          break
        case 'guard':
          guardPower += power
          break
      }
    }

    guardPower += mods.guard

    // The forge: start an item (paying for it), then hammer on it.
    if (smithPower > 0 && leadSmith) {
      if (!forge.wip && orderSlot) {
        const grade = forgeGrade(state.meta.masterLevel)
        const cost = forgeCost(grade)
        if (gold >= cost.gold && (materials.promotionStone ?? 0) >= cost.promotionStone) {
          gold -= cost.gold
          materials = { ...materials, promotionStone: (materials.promotionStone ?? 0) - cost.promotionStone }
          forge.wip = { slot: orderSlot, grade, progress: 0 }
        } else {
          for (const w of work) if (w.life.doing.kind === 'work' && w.life.job === 'blacksmith') w.life.doing.stalled = true
          if (lastStallDay !== day) {
            lastStallDay = day
            const last = chronicle[chronicle.length - 1]
            if (!(last && last.kind === 'stalled' && Math.floor(last.at / (L.slotMs * L.slotsPerDay)) === day)) {
              pushChronicle(chronicle, { at: atWorld, kind: 'stalled', heroIds: [leadSmith.hero.id] })
            }
          }
        }
      }
      if (forge.wip) {
        forge.wip.progress += smithPower
        if (forge.wip.progress >= (L.jobs.forgeWork[forge.wip.grade] ?? 20)) {
          const rnd = floatStream(seed, 'forge', slot)
          const apt = aptitude(leadSmith.hero, 'blacksmith')
          let grade = forge.wip.grade
          let masterwork = false
          if (rnd() < L.jobs.masterworkPerTier * leadTier * apt && gradeIdx(grade) < gradeIdx('S')) {
            grade = GRADES[gradeIdx(grade) + 1]!
            masterwork = true
          }
          const first = leadSmith.hero.name.split(/\s+/)[0]
          const item: EquipmentItem = {
            id: `eq_${String(inventory.length + 1).padStart(6, '0')}` as EquipmentId,
            slot: forge.wip.slot,
            grade,
            name: masterwork ? `${first}'s ${itemName(forge.wip.slot, grade)}` : itemName(forge.wip.slot, grade),
            statBonus: statBlockFor(forge.wip.slot, grade),
          }
          inventory = [...inventory, item]
          tally.forged++
          addMemory(leadSmith.life, { kind: 'forged', day, detail: item.name, weight: masterwork ? 70 : 35 })
          pushChronicle(chronicle, { at: atWorld, kind: masterwork ? 'masterwork' : 'forged', heroIds: [leadSmith.hero.id], detail: item.name })
          forge.wip = null
        }
      }
    }

    // 3. Live: needs, activity effects, sanity, grief.
    const trainMult = Math.min(L.train.instructorCap, 1 + L.train.instructorPerPower * instructorPower) * mods.trainMult
    for (const w of work) {
      const kind = w.life.doing.kind
      if (kind === 'away' || kind === 'captive' || kind === 'promoting' || kind === 'drilling') continue
      const n = w.life.needs
      const sleeping = kind === 'sleep'
      if (!sleeping) n.energy -= L.decay.energy
      n.hunger -= L.decay.hunger
      n.social -= L.decay.social * (0.5 + w.p.sociability)
      n.fun -= L.decay.fun
      switch (kind) {
        case 'sleep':
          if (w.life.doing.place === 'dormitory') n.energy += L.refill.sleep
          else {
            n.energy += L.refill.sleepFloor
            w.sanity -= L.sanity.noBed
          }
          break
        case 'eat':
          if (pantry >= 1) {
            pantry -= 1
            n.hunger += L.refill.meal
            n.fun += 3
            w.sanity += L.sanity.mealBonus
            tally.meals++
          } else n.hunger += L.refill.eat
          break
        case 'train': {
          const gain = Math.max(1, Math.round(xpToNext(w.xp.level) * L.train.xpShare * trainMult))
          if (!w.xp.atCap) tally.trainXp += gain
          w.xp = applyXp(w.xp, gain, w.hero.star)
          n.fun += 2
          break
        }
        case 'socialize':
          n.social += L.refill.socialize
          n.fun += 4
          break
        case 'hobby':
          n.fun += L.refill.hobby
          break
        case 'read':
          n.fun += L.refill.read
          break
        case 'wander':
          n.fun += 3
          break
        case 'pray':
          w.sanity += L.sanity.pray
          break
        case 'mourn': {
          w.life.grief -= L.grief.mourn
          w.sanity += 1
          // The first visit for a fallen friend is remembered.
          const lost = salientMemories(w.life, day).find((m) => m.kind === 'friendDied')
          if (lost?.other && !w.life.memories.some((m) => m.kind === 'mourned' && m.other === lost.other)) {
            addMemory(w.life, { kind: 'mourned', day, other: lost.other, weight: 40 })
            pushChronicle(chronicle, { at: atWorld, kind: 'mourning', heroIds: [w.hero.id, lost.other] })
          }
          break
        }
        case 'heal': {
          const heal = L.sanity.heal + L.sanity.healerPerPower * healerPower
          w.sanity += heal
          w.life.grief -= L.grief.healer * healerPower
          tally.healed += Math.round(heal)
          break
        }
      }
      estateLive(mods, w, kind, isSleepHour(hour, w.p))
      let unmet = 0
      let content = true
      for (const k of ['energy', 'hunger', 'social', 'fun'] as NeedKey[]) {
        n[k] = clamp(n[k])
        if (n[k] < L.sanity.unmetBelow) unmet++
        if (n[k] < L.sanity.contentAbove) content = false
      }
      w.sanity -= unmet * L.sanity.perUnmetNeed
      if (content) w.sanity += L.sanity.content
      w.life.grief = clamp(w.life.grief - L.grief.decay)
      w.sanity = clamp(w.sanity, 0, TUNING.lobby.sanityMax)
    }

    // 4. Company: heroes sharing a place get to know each other.
    const groups = new Map<LifePlace, Working[]>()
    for (const w of work) {
      const k = w.life.doing.kind
      if (k === 'sleep' || k === 'away' || k === 'captive' || k === 'promoting' || k === 'pray') continue
      const g = groups.get(w.life.doing.place)
      if (g) g.push(w)
      else groups.set(w.life.doing.place, [w])
    }
    for (const [place, g] of groups) {
      if (g.length < 2) continue
      const rnd = floatStream(seed, 'company', slot, place)
      // Shuffle (Fisher–Yates) then pair neighbours.
      const order = [...g]
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1))
        const tmp = order[i]!
        order[i] = order[j]!
        order[j] = tmp
      }
      const pairs = Math.min(R.pairsPerPlace, Math.floor(order.length / 2))
      for (let i = 0; i < pairs; i++) {
        const a = order[2 * i]!
        const b = order[2 * i + 1]!
        const social = a.life.doing.kind === 'socialize' && b.life.doing.kind === 'socialize'
        // Ambient contact (working side by side) only sometimes turns into a real exchange.
        if (!social && rnd() > 0.35) continue
        const key = relationKey(a.hero.id, b.hero.id)
        const rel = relations[key] ?? { affinity: 0, shared: 0 }
        const before = rel.affinity
        let delta = (social ? R.socializeGain : R.ambientGain) + chemistry(a.hero.id, b.hero.id) * R.chemistry + R.warmth * ((a.p.warmth + b.p.warmth) / 2)
        const cranky = a.life.needs.hunger < 20 || b.life.needs.hunger < 20 || a.life.needs.energy < 20 || b.life.needs.energy < 20
        const argue = rnd() < R.argueBase * a.p.temper * b.p.temper * 2 + (cranky ? 0.04 : 0) + (before <= R.rival ? 0.1 : 0)
        if (argue) {
          delta = -R.argueLoss * (0.5 + (a.p.temper + b.p.temper) / 2)
          addMemory(a.life, { kind: 'argued', day, other: b.hero.id, weight: 18 })
          addMemory(b.life, { kind: 'argued', day, other: a.hero.id, weight: 18 })
          if (a.p.temper > 0.6 && b.p.temper > 0.6) pushChronicle(chronicle, { at: atWorld, kind: 'argument', heroIds: [a.hero.id, b.hero.id] })
        }
        const after = clamp(Math.round((before + delta) * 10) / 10, -100, 100)
        relations[key] = { ...rel, affinity: after }
        a.life.needs.social = clamp(a.life.needs.social + L.refill.socialAmbient)
        b.life.needs.social = clamp(b.life.needs.social + L.refill.socialAmbient)
        if (social) {
          a.life.doing.with = b.hero.id
          b.life.doing.with = a.hero.id
        }
        crossThresholds(a, b, before, after, day, atWorld, chronicle)
      }
    }
  }

  // Prune the weakest pairs past the cap (the dead first: their bonds live on in memories).
  const keys = Object.keys(relations)
  if (keys.length > R.maxPairs) {
    const score = (k: string) => {
      const [a, b] = k.split('|') as [HeroId, HeroId]
      const dead = !state.heroes[a]?.alive || !state.heroes[b]?.alive
      return (dead ? -1000 : 0) + Math.abs(relations[k]!.affinity) + relations[k]!.shared * 3
    }
    keys.sort((x, y) => score(y) - score(x))
    for (const k of keys.slice(R.maxPairs)) delete relations[k]
  }

  const heroes = { ...state.heroes }
  for (const w of work) {
    heroes[w.hero.id] = { ...w.hero, sanity: Math.round(w.sanity * 100) / 100, xp: w.xp, life: w.life }
  }
  return {
    ...state,
    gold,
    materials,
    inventory,
    heroes,
    meta: { ...state.meta, pi, peekedFloors: peeked },
    life: { ...state.life, slot: target, relations, chronicle, pantry: Math.round(pantry * 100) / 100, forge, research, guardPower, tally },
  }
}

function crossThresholds(a: Working, b: Working, before: number, after: number, day: number, at: number, chronicle: ChronicleEntry[]): void {
  const up = (t: number) => before < t && after >= t
  const down = (t: number) => before > t && after <= t
  const mark = (kind: 'friends' | 'closeFriends' | 'rivals' | 'grudge', mem: 'befriended' | 'rivalry', weight: number) => {
    addMemory(a.life, { kind: mem, day, other: b.hero.id, weight, detail: kind })
    addMemory(b.life, { kind: mem, day, other: a.hero.id, weight, detail: kind })
    pushChronicle(chronicle, { at, kind, heroIds: [a.hero.id, b.hero.id] })
  }
  if (up(R.closeFriend)) mark('closeFriends', 'befriended', 65)
  else if (up(R.friend)) mark('friends', 'befriended', 50)
  else if (down(R.grudge)) mark('grudge', 'rivalry', 60)
  else if (down(R.rival)) mark('rivals', 'rivalry', 45)
}

/** The activity record for a hero right now (for the UI). */
export function activityOf(hero: OwnedHero): HeroActivity {
  const pin = pinned(hero)
  if (pin) return { kind: pin, place: pin === 'promoting' ? 'promotion' : pin === 'drilling' ? 'yard' : 'offsite', untilSlot: 0 }
  return lifeOf(hero).doing
}
