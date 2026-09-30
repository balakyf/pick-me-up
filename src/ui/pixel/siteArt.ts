/**
 * Construction-site art for the campus (see world/sites.ts): the timber frame that
 * stands where an unbuilt building's roof would be, the staked dirt lot of an unbuilt
 * yard or garden, the signpost at the future counter, and the markers that float over a
 * site (a hammer: build here · a padlock: not yet · an hourglass: under way).
 */
import { createBitmap, hex, hline, line, mix, outline, rect, roundRect, set, vline, type Bitmap } from './bitmap'
import { GOLD, INK, LINEN, STEEL, WOOD } from './palette'
import { hashString, seededRand } from './rand'
import { ROOF_LIFT } from './campusProps'
import { TILE, type Building, type Rect } from '../world/lobbyMap'

const DIRT = hex('#4a3526')
const DIRT_D = hex('#3a281c')
const DIRT_L = hex('#6a4e36')
const TARP = hex('#8a6e4a')

/** Bare earth over a whole room: the "dark, unbuilt place" of the First Steps hint. */
export function drawLot(r: Rect, key: string): Bitmap {
  const w = r.w * TILE
  const h = r.h * TILE
  const b = createBitmap(w, h)
  const rnd = seededRand(hashString(`lot|${key}`))
  rect(b, 0, 0, w, h, DIRT)
  for (let i = 0; i < (w * h) / 40; i++) {
    const x = Math.floor(rnd.next() * w)
    const y = Math.floor(rnd.next() * h)
    set(b, x, y, rnd.chance(0.5) ? DIRT_D : DIRT_L)
  }
  // Furrows left by the surveyors' rope.
  for (let y = 6; y < h; y += 11) for (let x = 3; x < w - 3; x += 2) if (rnd.chance(0.7)) set(b, x, y, DIRT_D)
  // Stakes at the corners and along the edges, strung with rope.
  const rope = hex('#c8b490')
  hline(b, 2, 3, w - 4, rope)
  hline(b, 2, h - 4, w - 4, rope)
  vline(b, 2, 3, h - 6, rope)
  vline(b, w - 3, 3, h - 6, rope)
  for (let x = 2; x < w - 1; x += 24) stake(b, x, 1)
  for (let x = 2; x < w - 1; x += 24) stake(b, x, h - 6)
  stake(b, w - 3, 1)
  stake(b, w - 3, h - 6)
  return b
}

function stake(b: Bitmap, x: number, y: number): void {
  vline(b, x, y, 5, WOOD.l)
  set(b, x, y + 5, WOOD.d)
}

/**
 * The timber frame that stands in an unbuilt building's place, sized exactly like its
 * roof (drawRoof) so it slots into the same draw call: posts, beams, cross-braces and a
 * tarp over one bay. The interior shows through.
 */
export function drawSiteFrame(bld: Building, building: boolean): Bitmap {
  const w = bld.rect.w * TILE
  const body = (bld.rect.h - 1) * TILE + ROOF_LIFT
  const b = createBitmap(w, body + 5)
  const post = WOOD.m
  const beam = WOOD.l
  const shade = WOOD.d
  const bays = Math.max(2, Math.round(w / 40))
  const bayW = (w - 4) / bays
  const topY = 2
  const midY = Math.round(body * 0.45)
  const botY = body - 2
  // Beams across the top, the middle and the sill.
  for (const y of [topY, midY, botY]) {
    hline(b, 1, y, w - 2, beam)
    hline(b, 1, y + 1, w - 2, shade)
  }
  // Posts and cross-braces bay by bay.
  for (let i = 0; i <= bays; i++) {
    const x = Math.round(2 + i * bayW)
    vline(b, x, topY, botY - topY + 2, post)
    vline(b, x + 1, topY, botY - topY + 2, shade)
    if (i < bays) {
      const nx = Math.round(2 + (i + 1) * bayW)
      line(b, x + 1, i % 2 ? topY + 2 : midY - 1, nx - 1, i % 2 ? midY - 1 : topY + 2, shade)
    }
  }
  // A tarp over the first bay (the whole frame when a build is under way).
  const tarpW = building ? w - 6 : Math.round(bayW) - 2
  for (let y = topY + 2; y < midY; y++) {
    const sag = Math.round(Math.sin(((y - topY) / (midY - topY)) * Math.PI) * 2)
    hline(b, 4 + sag, y, tarpW - sag * 2, y % 3 === 0 ? mix(TARP, INK, 0.25) : TARP)
  }
  // Scaffold ladder by the right post.
  const lx = w - 10
  vline(b, lx, midY, botY - midY, WOOD.l)
  vline(b, lx + 5, midY, botY - midY, WOOD.l)
  for (let y = midY + 3; y < botY; y += 4) hline(b, lx, y, 6, WOOD.m)
  return outline(b, INK)
}

/** The signpost standing at a site's future counter (a 1-tile prop, drawn taller). */
export function drawSign(): { bmp: Bitmap; dx: number; dy: number } {
  const b = createBitmap(16, 22)
  vline(b, 7, 8, 14, WOOD.d)
  vline(b, 8, 8, 14, WOOD.m)
  roundRect(b, 1, 1, 14, 10, LINEN.m)
  hline(b, 1, 1, 14, LINEN.l)
  hline(b, 1, 10, 14, LINEN.d)
  hammerGlyph(b, 4, 2, INK)
  return { bmp: outline(b, INK), dx: 0, dy: -8 }
}

function hammerGlyph(b: Bitmap, x: number, y: number, head: number): void {
  rect(b, x, y, 6, 3, head)
  set(b, x + 6, y + 1, head)
  for (let i = 0; i < 5; i++) set(b, x + 2 + (i > 2 ? 1 : 0), y + 3 + i, WOOD.m)
}

export type SiteMarker = 'build' | 'short' | 'locked' | 'building'

/** The bubble that floats over a site. */
export function drawSiteMarker(kind: SiteMarker): Bitmap {
  const b = createBitmap(15, 16)
  const bg = kind === 'build' ? GOLD.l : kind === 'building' ? hex('#9ad4ff') : kind === 'short' ? LINEN.l : STEEL.m
  roundRect(b, 0, 0, 15, 12, bg)
  set(b, 6, 12, bg)
  set(b, 7, 12, bg)
  set(b, 8, 12, bg)
  set(b, 7, 13, bg)
  if (kind === 'build' || kind === 'short') {
    rect(b, 3, 2, 8, 3, kind === 'build' ? STEEL.d : STEEL.m)
    set(b, 11, 3, STEEL.d)
    vline(b, 7, 5, 6, WOOD.d)
  } else if (kind === 'locked') {
    // padlock
    rect(b, 5, 2, 5, 1, INK)
    vline(b, 4, 3, 3, INK)
    vline(b, 10, 3, 3, INK)
    rect(b, 3, 6, 9, 5, GOLD.d)
    set(b, 7, 8, INK)
  } else {
    // hourglass
    hline(b, 4, 2, 7, WOOD.d)
    hline(b, 4, 10, 7, WOOD.d)
    for (let i = 0; i < 3; i++) {
      hline(b, 5 + i, 3 + i, 5 - i * 2, GOLD.m)
      hline(b, 5 + i, 9 - i, 5 - i * 2, i === 0 ? GOLD.m : INK)
    }
    set(b, 7, 6, GOLD.m)
  }
  return outline(b, INK)
}
