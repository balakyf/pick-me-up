/**
 * Quanton Life — jobs. The Master assigns a living hero to a building; the hero works
 * there during work hours (§2 of the Living Lobby spec). Output scales with aptitude
 * (background + attributes + temperament), the job's skill tier (work slots banked) and
 * the building's level. Pure.
 */
import { TUNING } from '../tuning'
import { smithyUnlocked } from '../equipment'
import type { FacilityId, GameState, HeroId, JobId, LifePlace, OwnedHero } from '../types'
import { BACKGROUNDS, personalityOf } from './personality'

const J = TUNING.life.jobs

export const JOBS: JobId[] = ['blacksmith', 'cook', 'instructor', 'scholar', 'healer', 'gardener', 'merchant', 'guard']

/** The building each job works in. */
export const JOB_FACILITY: Record<JobId, FacilityId> = {
  blacksmith: 'forge',
  cook: 'kitchen',
  instructor: 'trainingCenter',
  scholar: 'library',
  healer: 'infirmary',
  gardener: 'garden',
  merchant: 'market',
  guard: 'watchtower',
}

export const JOB_PLACE: Record<JobId, LifePlace> = {
  blacksmith: 'forge',
  cook: 'kitchen',
  instructor: 'yard',
  scholar: 'library',
  healer: 'infirmary',
  gardener: 'garden',
  merchant: 'market',
  guard: 'watchtower',
}

export const TIER_NAMES = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'] as const

/** Skill tier 0..4 from banked work slots. */
export function jobTier(xp: number): number {
  let t = 0
  for (let i = 0; i < J.tiers.length; i++) if (xp >= J.tiers[i]!) t = i
  return t
}

export function tierMult(xp: number): number {
  return 1 + J.perTier * jobTier(xp)
}

/** How naturally suited a hero is to a job: ~0.5 (hopeless) … ~2 (born to it). */
export function aptitude(hero: OwnedHero, job: JobId): number {
  const p = personalityOf(hero)
  const bg = BACKGROUNDS[p.background]?.aptitude[job] ?? 0
  const a = hero.baseAttrs
  const attr = (v: number) => Math.min(0.3, v / 200)
  let fit = 0
  switch (job) {
    case 'blacksmith':
      fit = attr(a.str + a.vit) + p.diligence * 0.2
      break
    case 'cook':
      fit = attr(a.agi + a.wil) + p.warmth * 0.2
      break
    case 'instructor':
      fit = Math.min(0.3, hero.star * 0.05 + hero.xp.level / 400) + p.courage * 0.1 + p.diligence * 0.1
      break
    case 'scholar':
      fit = attr(a.int * 2) + p.curiosity * 0.25
      break
    case 'healer':
      fit = attr(a.wil * 2) + p.warmth * 0.25
      break
    case 'gardener':
      fit = attr(a.vit + a.wil) + p.diligence * 0.15
      break
    case 'merchant':
      fit = attr(a.int + a.agi) + p.sociability * 0.25
      break
    case 'guard':
      fit = attr(a.vit + a.str) + p.courage * 0.2
      break
  }
  if (job === 'scholar' && hero.heroClass === 'mage') fit += 0.2
  if (job === 'instructor' && hero.heroClass) fit += 0.1
  return Math.round(Math.max(0.5, Math.min(2.2, 0.7 + 0.35 * bg + fit)) * 100) / 100
}

export type JobFeeling = 'likes' | 'neutral' | 'dislikes'

export function jobFeeling(hero: OwnedHero, job: JobId): JobFeeling {
  const apt = aptitude(hero, job)
  if (apt >= J.likeAt) return 'likes'
  if (apt < J.dislikeAt) return 'dislikes'
  return 'neutral'
}

/** A job's building is open for work (built, and the Smithy unlocked for smiths). */
export function jobOpen(state: GameState, job: JobId): boolean {
  if (job === 'blacksmith' && !smithyUnlocked(state)) return false
  return state.facilities[JOB_FACILITY[job]].level > 0
}

/** Seats at a job = its building level. */
export function jobSeats(state: GameState, job: JobId): number {
  return jobOpen(state, job) ? state.facilities[JOB_FACILITY[job]].level * J.seatsPerLevel : 0
}

export function jobHolders(state: GameState, job: JobId): OwnedHero[] {
  return Object.values(state.heroes).filter((h) => h.alive && h.life?.job === job)
}

/** Output power of one worker: aptitude × tier × building level multiplier. */
export function workPower(state: GameState, hero: OwnedHero, job: JobId): number {
  const lvl = state.facilities[JOB_FACILITY[job]].level
  const xp = hero.life?.jobXp[job] ?? 0
  return aptitude(hero, job) * tierMult(xp) * (1 + 0.15 * Math.max(0, lvl - 1))
}

/** ASSIGN_JOB: give a hero a job (or relieve them with null). Throws when not allowed. */
export function assignJob(state: GameState, heroId: HeroId, job: JobId | null, lifeOf: (h: OwnedHero) => NonNullable<OwnedHero['life']>): GameState {
  const hero = state.heroes[heroId]
  if (!hero || !hero.alive) throw new Error('assignJob: no such living hero')
  const life = lifeOf(hero)
  if (life.job === job) return state
  if (job !== null) {
    if (!jobOpen(state, job)) throw new Error(`assignJob: the ${JOB_FACILITY[job]} is not open`)
    const taken = jobHolders(state, job).filter((h) => h.id !== heroId).length
    if (taken >= jobSeats(state, job)) throw new Error('assignJob: every seat at that job is taken')
  }
  const doing = life.doing.kind === 'work' ? { ...life.doing, untilSlot: 0 } : life.doing
  return { ...state, heroes: { ...state.heroes, [heroId]: { ...hero, life: { ...life, job, doing } } } }
}
