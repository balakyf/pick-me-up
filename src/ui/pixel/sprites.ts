/**
 * Cached sprite lookups keyed by identity — what React components and the game
 * loops actually call. Generation is pure; caching lives in render.ts.
 */
import { iselLook, keyBearerLook, lookForHero, lookForMaster, priasisLook, type HeroLook, type LookSource } from './look'
import { drawReliquary } from './enemySprite'
import type { Bitmap } from './bitmap'
import { drawHeroBust, drawHeroFrame, drawHeroPose, type Dir, type HeroPose, type WalkFrame } from './heroSprite'
import { cachedCanvas, cachedDataUrl } from './render'
import { drawEnemy, drawEnemyPose } from './enemySprite'
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

export function enemyUrl(name: string, element: Element): string {
  const id = enemyTemplateIdForName(name)
  return cachedDataUrl(`en|${id}|${element}`, () => drawEnemy(id, element))
}

export function enemySize(name: string, element: Element): { w: number; h: number } {
  const b = drawEnemy(enemyTemplateIdForName(name), element)
  return { w: b.w, h: b.h }
}

// ── battle poses (WP0 contract; WP8 draws the real frames) ───────────────────

/** A battle pose (the WP0 contract; WP2 maps battle events onto these). */
export type Pose = 'idle' | 'attack' | 'cast' | 'hurt' | 'ko'

/**
 * Every pose the art can draw: the contract's five plus `windup` (the anticipation
 * frame before `attack`) and `blink` (idle with shut eyes, for the idle-life overlay).
 * A superset of `Pose`, so existing `heroPoseUrl(hero, pose)` callers are unaffected.
 */
export type ArtPose = HeroPose

/**
 * Battle frame for a hero (facing left, with the party) in a pose. `idle` shares the
 * walk-frame-0 cache entry (the pixels are identical); other poses cache under the
 * `hp|` prefix: at most 6 entries per hero, never one per animation frame.
 */
export function heroPoseUrl(hero: LookSource, pose: ArtPose): string {
  if (pose === 'idle') return heroFrameUrl(hero, 'left', 0)
  return cachedDataUrl(`hp|${lookKey(hero)}|${pose}`, () => drawHeroPose(heroLook(hero), pose))
}

/** Canvas variant of `heroPoseUrl` (for canvas scenes such as lobby sparring). */
export function heroPoseCanvas(hero: LookSource, pose: ArtPose) {
  if (pose === 'idle') return heroFrameCanvas(hero, 'left', 0)
  return cachedCanvas(`hp|${lookKey(hero)}|${pose}`, () => drawHeroPose(heroLook(hero), pose))
}

/** The blink overlay for a hero's battle idle frame (see `poses.ts`, idle life). */
export function heroBlinkUrl(hero: LookSource): string {
  return heroPoseUrl(hero, 'blink')
}

/** Battle frame for an enemy in a pose (facing right). `idle` is exactly `enemyUrl`. */
export function enemyPoseUrl(name: string, element: Element, pose: ArtPose): string {
  if (pose === 'idle') return enemyUrl(name, element)
  const id = enemyTemplateIdForName(name)
  return cachedDataUrl(`en|${id}|${element}|${pose}`, () => drawEnemyPose(id, element, pose))
}

/** Battle frame for a mission NPC ally in a pose (objects such as the reliquary never move). */
export function allyPoseUrl(name: string, pose: ArtPose): string {
  if (pose === 'idle' || ALLY_OBJECTS[name]) return allyFrameUrl(name)
  const make = ALLY_LOOKS[name] ?? priasisLook
  return cachedDataUrl(`allyp|${name}|${pose}`, () => drawHeroPose(make(), pose))
}
