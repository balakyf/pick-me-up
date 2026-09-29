/**
 * Cached sprite lookups keyed by identity — what React components and the game
 * loops actually call. Generation is pure; caching lives in render.ts.
 */
import { iselLook, lookForHero, lookForMaster, priasisLook, type HeroLook, type LookSource } from './look'
import { drawHeroBust, drawHeroFrame, type Dir, type WalkFrame } from './heroSprite'
import { cachedCanvas, cachedDataUrl } from './render'
import { drawEnemy } from './enemySprite'
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

const ALLY_LOOKS: Record<string, () => HeroLook> = { 'Princess Priasis': priasisLook }

/** Battle frame (facing left, with the party) for a mission NPC, by display name. */
export function allyFrameUrl(name: string, frame: WalkFrame = 0): string {
  const make = ALLY_LOOKS[name] ?? priasisLook
  return cachedDataUrl(`ally|${name}|${frame}`, () => drawHeroFrame(make(), 'left', frame))
}

export function allyBustUrl(name: string): string {
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
