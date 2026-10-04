/**
 * Back at camp (lane L): when the Master comes home from the tower, a short word on who is
 * tired, who is grieving, whose spirits are low and who is ready — and what to do about it,
 * with one click where the game already has the command (a banquet, resting the tired by
 * swapping in fresh heroes, a word with the withdrawn). Pure; the window renders it.
 */
import type { GameState, HeroId, Line, OwnedHero } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { moraleOf, lifeOf } from '../../engine/life'
import { banquetRefusal } from '../../engine/kitchen'
import { canDeploy } from '../../engine/tower'
import { fatigueAt, traumaOf } from '../../engine/estate'
import { heroCpFull } from '../../engine/unit/trueCp'

/** Below this Sanity a party hero needs rest. */
export const TIRED_SANITY = 60
/** Grief at/above this is worth a word. */
export const GRIEF_LINE = 20

export type CampAction =
  | { kind: 'banquet'; gold: number }
  | { kind: 'rest'; slots: (HeroId | null)[]; lines: Line[]; out: HeroId[]; in: HeroId[] }
  | { kind: 'talk'; heroId: HeroId }
  | { kind: 'place'; place: 'tavern' | 'infirmary' | 'memorial' }
  | { kind: 'gazette' }

export interface CampSummary {
  tired: HeroId[]
  grieving: HeroId[]
  troubled: HeroId[]
  ready: HeroId[]
  actions: CampAction[]
}

function needsRest(state: GameState, h: OwnedHero): boolean {
  if (h.sanity < TIRED_SANITY) return true
  if (lifeOf(h).needs.energy < 25) return true
  const t = state.estate?.trauma?.[h.id]
  return t ? fatigueAt(t, state.meta.lastSeenAtWorld) >= 3 : false
}

function low(state: GameState, id: HeroId): boolean {
  const b = moraleOf(state, id).band
  return b === 'shaken' || b === 'broken'
}

/** Fit, rested and in decent spirits: ready for the next floor. */
export function readyToFight(state: GameState, h: OwnedHero): boolean {
  if (!canDeploy(state, h, { rebellion: false })) return false
  const b = moraleOf(state, h.id).band
  return !needsRest(state, h) && b !== 'shaken' && b !== 'broken' && b !== 'low'
}

/**
 * Rest the tired: the party with every tired or troubled member swapped for the strongest
 * ready hero on the bench (lines kept). Null when nobody needs swapping or nobody can.
 */
export function restSwap(state: GameState): Extract<CampAction, { kind: 'rest' }> | null {
  const slots = [...state.party.slots]
  const inParty = new Set(slots.filter(Boolean) as HeroId[])
  const bench = (Object.values(state.heroes) as OwnedHero[])
    .filter((h) => h.alive && !inParty.has(h.id) && readyToFight(state, h))
    .sort((a, b) => heroCpFull(state, b) - heroCpFull(state, a) || (a.id < b.id ? -1 : 1))
  const out: HeroId[] = []
  const inn: HeroId[] = []
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i]
    if (!id) continue
    const h = state.heroes[id]
    if (!h || !h.alive) continue
    if (!needsRest(state, h) && !low(state, id)) continue
    const fresh = bench.shift()
    if (!fresh) break
    out.push(id)
    inn.push(fresh.id)
    slots[i] = fresh.id
  }
  if (out.length === 0) return null
  return { kind: 'rest', slots, lines: [...state.party.lines], out, in: inn }
}

export function campSummary(state: GameState): CampSummary {
  const party = (state.party.slots.filter(Boolean) as HeroId[]).map((id) => state.heroes[id]).filter((h): h is OwnedHero => !!h && h.alive)
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const tired = party.filter((h) => needsRest(state, h)).map((h) => h.id)
  const grieving = living
    .filter((h) => lifeOf(h).grief >= GRIEF_LINE)
    .sort((a, b) => lifeOf(b).grief - lifeOf(a).grief || (a.id < b.id ? -1 : 1))
    .map((h) => h.id)
  const troubled = living
    .filter((h) => low(state, h.id))
    .sort((a, b) => moraleOf(state, a.id).score - moraleOf(state, b.id).score || (a.id < b.id ? -1 : 1))
    .map((h) => h.id)
  const ready = party.filter((h) => readyToFight(state, h)).map((h) => h.id)

  const actions: CampAction[] = []
  const swap = restSwap(state)
  if (swap) actions.push(swap)
  const weary = living.filter((h) => h.sanity < TIRED_SANITY).length
  if (banquetRefusal(state) === null && (weary >= 2 || troubled.length >= 2)) actions.push({ kind: 'banquet', gold: TUNING.lobby.banquet.gold })
  for (const h of living) if (traumaOf(state, h.id).withdrawn && actions.filter((a) => a.kind === 'talk').length < 2) actions.push({ kind: 'talk', heroId: h.id })
  if (grieving.length > 0) actions.push({ kind: 'place', place: 'memorial' })
  if (weary > 0 && state.facilities.infirmary.level > 0) actions.push({ kind: 'place', place: 'infirmary' })
  if (troubled.length > 0 && state.facilities.tavern.level > 0) actions.push({ kind: 'place', place: 'tavern' })
  actions.push({ kind: 'gazette' })
  return { tired, grieving: grieving.slice(0, 8), troubled: troubled.slice(0, 8), ready, actions }
}

/** Is there anything worth saying? */
export function campHasNews(s: CampSummary): boolean {
  return s.tired.length + s.grieving.length + s.troubled.length > 0
}

/** What a tower visit leaves behind (the summary shows when this changed). */
export function towerMark(state: GameState): string {
  const t = state.tower
  return `${t.highestCleared}|${t.currentFloor}|${t.attemptIndex}|${state.life.memorial.length}`
}
