/**
 * Lane Q: guild banners for PvP's title cards and the guild hall — a swallow-tailed banner
 * on a crossbar in the guild's cloth, with its emblem (a whale for the Unity Society, a crown
 * for Kaiser, a star, a lantern, a flame, a tower; a skull for a lone raider). Deterministic
 * bitmaps (rule 12): the key is the guild and the frame (0/1, the cloth's two folds).
 */
import { createBitmap, hex, hline, mix, outline, rect, set, vline, type Bitmap } from './bitmap'
import { GOLD, INK, WOOD } from './palette'
import type { CrestEmblem, GuildLook } from '../pvp/pvpModel'

/** 9×9 emblems: '#' is the emblem ink, '+' its highlight. */
const EMBLEMS: Record<CrestEmblem, string[]> = {
  whale: ['.........', '......#..', '.....#.#.', '.#####...', '#######..', '##+####.#', '#########', '.#######.', '.........'],
  crown: ['.........', '#...#...#', '##.###.##', '#########', '#+#+#+#+#', '#########', '.#######.', '.........', '.........'],
  star: ['....#....', '....#....', '...###...', '#########', '.#######.', '..##+##..', '..##.##..', '.##...##.', '.#.....#.'],
  lantern: ['...###...', '....#....', '..#####..', '.##+++##.', '.#+++++#.', '.##+++##.', '..#####..', '...###...', '.........'],
  flame: ['....#....', '...##....', '...###.#.', '..#####..', '.###+###.', '.##+++##.', '.##+++##.', '..##+##..', '...###...'],
  tower: ['.#.#.#.#.', '.#######.', '..#####..', '..##+##..', '..#####..', '..##+##..', '..#####..', '.#######.', '#########'],
  skull: ['..#####..', '.#######.', '##+###+##', '#++###++#', '#########', '.###.###.', '..#####..', '..#.#.#..', '.........'],
}

/** A guild's banner, 22×32, hanging from a crossbar; frame 1 folds the cloth the other way. */
export function crestBanner(look: GuildLook, frame: 0 | 1 = 0): Bitmap {
  const W = 22
  const H = 32
  const b = createBitmap(W, H)
  const [d, m, l] = look.cloth.map(hex) as [number, number, number]
  // The crossbar and its finials.
  hline(b, 1, 1, W - 2, WOOD.m)
  hline(b, 1, 2, W - 2, WOOD.d)
  set(b, 0, 1, GOLD.l)
  set(b, W - 1, 1, GOLD.l)
  // The cloth: a swallow-tailed banner, its folds shaded (the frame swaps them).
  const top = 3
  const tail = H - 2
  for (let y = top; y <= tail; y++) {
    const cut = y > tail - 6 ? y - (tail - 6) : 0
    for (let x = 3; x < W - 3; x++) {
      // the swallowtail: a notch rising from the bottom centre
      const mid = Math.abs(x - (W - 1) / 2)
      if (cut > 0 && mid < cut) continue
      const fold = Math.floor((x - 3) / 4) % 2 === frame ? m : mix(m, d, 0.45)
      set(b, x, y, fold)
    }
  }
  vline(b, 3, top, tail - top - 2, l)
  vline(b, W - 4, top, tail - top - 2, d)
  hline(b, 3, top, W - 6, l)
  // A gold trim under the bar.
  for (let x = 3; x < W - 3; x += 2) set(b, x, top + 1, GOLD.m)
  // The emblem.
  const ink = hex(look.ink)
  const glint = mix(ink, hex('#ffffff'), 0.55)
  const rows = EMBLEMS[look.emblem]
  const ox = Math.floor((W - 9) / 2)
  const oy = 9
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y]!.length; x++) {
      const ch = rows[y]![x]
      if (ch === '#') set(b, ox + x, oy + y, ink)
      else if (ch === '+') set(b, ox + x, oy + y, glint)
    }
  return outline(b, INK)
}

/** A small round shield for the rival rows (12×13). */
export function crestShield(look: GuildLook): Bitmap {
  const b = createBitmap(12, 13)
  const [d, m, l] = look.cloth.map(hex) as [number, number, number]
  rect(b, 0, 0, 12, 8, m)
  for (let y = 8; y < 13; y++) hline(b, y - 7, y, 12 - (y - 7) * 2, m)
  vline(b, 0, 0, 8, l)
  hline(b, 0, 0, 12, l)
  vline(b, 11, 0, 8, d)
  const ink = hex(look.ink)
  const rows = EMBLEMS[look.emblem]
  // the emblem, shrunk to its middle 6×6
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (rows[y + 1]![x + 1] !== '.') set(b, 3 + x, 2 + y, ink)
  return outline(b, INK)
}
