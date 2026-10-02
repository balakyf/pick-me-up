/**
 * Cached sprite lookups keyed by identity — what React components and the game
 * loops actually call. Generation is pure; caching lives in render.ts.
 */
import { iselLook, keyBearerLook, lookForHero, lookForMaster, priasisLook, type HeroLook, type LookSource } from './look'
import { drawReliquary } from './enemySprite'
import type { Bitmap } from './bitmap'
import { drawHeroBust, drawHeroFrame, drawHeroPose, KO_H, KO_W, FRAME_H, FRAME_W, type Dir, type HeroPose, type WalkFrame } from './heroSprite'
import { cachedCanvas, cachedDataUrl } from './render'
import { drawEnemy, type IdleFrame } from './enemySprite'
import { ENEMY_TEMPLATES } from '../../engine/content'
import type { Element } from '../../engine/types'

const lookCache = new Map<string, HeroLook>()

function lookKey(src: LookSource): string {
  return `${src.id}|${src.name}|${src.star}|${src.heroClass}|${src.element}|${src.portraitToken ?? ''}`
}

export function heroLook(src: LookSource): HeroLook {
  const k = lookKey(src)
  let l = lookCache.get(k)
  if (!l) {
    l = lookForHero(src)
    lookCache.set(k, l)
  }
  return l
}

export function heroFrameCanvas(src: LookSource, dir: Dir, frame: WalkFrame) {
  return cachedCanvas(`hf|${lookKey(src)}|${dir}|${frame}`, () => drawHeroFrame(heroLook(src), dir, frame))
}

export function heroFrameUrl(src: LookSource, dir: Dir, frame: WalkFrame): string {
  return cachedDataUrl(`hf|${lookKey(src)}|${dir}|${frame}`, () => drawHeroFrame(heroLook(src), dir, frame))
}

/**
 * A hero's battle pose (lane I): a fixed bitmap per look and pose — the keys are bounded
 * (seven poses), so the never-evicting cache stays small.
 */
export function heroPoseUrl(src: LookSource, pose: HeroPose): string {
  return cachedDataUrl(`hp|${lookKey(src)}|${pose}`, () => drawHeroPose(heroLook(src), pose))
}

/** The size a pose's bitmap draws at (the fallen lie wider than they stand). */
export function poseSize(pose: HeroPose): { w: number; h: number } {
  return pose === 'ko' ? { w: KO_W, h: KO_H } : { w: FRAME_W, h: FRAME_H }
}

export function heroBustUrl(src: LookSource): string {
  return cachedDataUrl(`hb|${lookKey(src)}`, () => drawHeroBust(heroLook(src)))
}

export function masterFrameCanvas(accountId: string, dir: Dir, frame: WalkFrame) {
  return cachedCanvas(`mf|${accountId}|${dir}|${frame}`, () => drawHeroFrame(lookForMaster(accountId), dir, frame))
}

export function masterBustUrl(accountId: string): string {
  return cachedDataUrl(`mb|${accountId}`, () => drawHeroBust(lookForMaster(accountId)))
}

export function iselBustUrl(): string {
  return cachedDataUrl('isel', () => drawHeroBust(iselLook()))
}

// ── mission NPC allies ───────────────────────────────────────────────────────

const ALLY_LOOKS: Record<string, () => HeroLook> = { 'Princess Priasis': priasisLook, 'Key Bearer': keyBearerLook }

/** Mission NPCs that aren't people (the F50 Sealed Object) draw as a bespoke bitmap. */
const ALLY_OBJECTS: Record<string, () => Bitmap> = { 'Sealed Object': drawReliquary }

/** Battle frame (facing left, with the party) for a mission NPC, by display name. */
export function allyFrameUrl(name: string, frame: WalkFrame = 0): string {
  const obj = ALLY_OBJECTS[name]
  if (obj) return cachedDataUrl(`allyo|${name}`, obj)
  const make = ALLY_LOOKS[name] ?? priasisLook
  return cachedDataUrl(`ally|${name}|${frame}`, () => drawHeroFrame(make(), 'left', frame))
}

/** A mission NPC's battle pose; an object (the Sealed Object) has none and keeps its one frame. */
export function allyPoseUrl(name: string, pose: HeroPose): string {
  const obj = ALLY_OBJECTS[name]
  if (obj) return cachedDataUrl(`allyo|${name}`, obj)
  const make = ALLY_LOOKS[name] ?? priasisLook
  return cachedDataUrl(`allyp|${name}|${pose}`, () => drawHeroPose(make(), pose))
}

/** Whether a mission NPC is a person (it can be posed) rather than an object. */
export function allyPosable(name: string): boolean {
  return ALLY_OBJECTS[name] === undefined
}

export function allyBustUrl(name: string): string {
  const obj = ALLY_OBJECTS[name]
  if (obj) return cachedDataUrl(`allyo|${name}`, obj)
  const make = ALLY_LOOKS[name] ?? priasisLook
  return cachedDataUrl(`allyb|${name}`, () => drawHeroBust(make()))
}

// ── enemies ──────────────────────────────────────────────────────────────────

const templateByName = new Map<string, string>(
  Object.values(ENEMY_TEMPLATES).map((t) => [t.name, t.id] as [string, string]),
)

/** Battle-log units only carry a display name; map it back to the template art. */
export function enemyTemplateIdForName(name: string): string {
  return templateByName.get(name) ?? 'unknown'
}

/** A foe's sprite; `frame` 1 is the other half of its idle (a breath, a bob, a wingbeat). */
export function enemyUrl(name: string, element: Element, frame: IdleFrame = 0): string {
  const id = enemyTemplateIdForName(name)
  return cachedDataUrl(frame === 0 ? `en|${id}|${element}` : `en|${id}|${element}|${frame}`, () => drawEnemy(id, element, frame))
}

export function enemySize(name: string, element: Element): { w: number; h: number } {
  const b = drawEnemy(enemyTemplateIdForName(name), element)
  return { w: b.w, h: b.h }
}
