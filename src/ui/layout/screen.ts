/**
 * Lane Q · big-screen layouts: the pure half. Which tier a screen is (a phone held upright,
 * a tablet, a laptop, a big monitor), and how wide the battle's foe column must be for the
 * longest foe name on the field not to ellipsize (lanes A and E's leftover). The CSS lives
 * in bigScreen.css; BattleScene hands the column width over as `--foe-col`.
 */

export type ScreenTier = 'phone' | 'tablet' | 'desktop' | 'wide'

/** The big-screen line: at or past it the war room, the battle and the lobby HUD spread out. */
export const WIDE_MIN_W = 1600

export function screenTier(w: number, h: number): ScreenTier {
  if (w < 700) return 'phone'
  if (w < 1100) return 'tablet'
  if (w >= WIDE_MIN_W && h >= 800) return 'wide'
  return 'desktop'
}

/** How the foe column measures (px at its font size). */
export const FOE_COL = {
  /** One glyph of the pixel font at 16px (Pixelify runs about 0.56em; digits are wider). */
  charPx: 9,
  /** "Lv99" after the name, and the gap before it. */
  levelPx: 46,
  /** The HP bar and the row's gap. */
  barPx: 78,
  /** The window's padding and border. */
  framePx: 30,
  /** The big screen's font is larger by this much. */
  wideScale: 1.15,
  /** Never narrower or wider than this (per tier). */
  min: { desktop: 220, wide: 300 } as Record<'desktop' | 'wide', number>,
  max: { desktop: 400, wide: 560 } as Record<'desktop' | 'wide', number>,
} as const

/**
 * The foe column's width (px) so the longest name fits, or null where the column is not a
 * column (a phone stacks the windows; a tablet shares the row). `many`: the big-wave mode
 * lays the foes out in two compact columns (no level shown, a shorter bar).
 */
export function foeColumnPx(longestChars: number, tier: ScreenTier, many = false): number | null {
  if (tier === 'phone' || tier === 'tablet') return null
  const k = tier === 'wide' ? FOE_COL.wideScale : 1
  const name = Math.max(4, longestChars) * FOE_COL.charPx * k
  const one = many ? name + 48 * k : name + FOE_COL.levelPx * k + FOE_COL.barPx * k
  const raw = Math.ceil((many ? one * 2 + 10 : one) + FOE_COL.framePx)
  return Math.max(FOE_COL.min[tier], Math.min(FOE_COL.max[tier], raw))
}

/** The longest name among the foes (in characters, as shown). */
export function longestName(names: readonly string[]): number {
  return names.reduce((n, s) => Math.max(n, [...s].length), 0)
}
