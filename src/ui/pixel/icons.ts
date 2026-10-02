/**
 * The pixel icon set: elements, classes, the HUD and the language flags, drawn as tiny
 * deterministic bitmaps instead of emoji (which look different on every OS, and whose
 * flags read "GB" / "FR" on Windows). Every element and class has its own *shape* as well
 * as its colour — flame, drop, gust, peak, sun, moon, blade — so a colour-blind Master
 * tells them apart by outline alone (icons.test.ts checks every pair's silhouette).
 *
 * Each icon is a small character grid with a legend; `iconBitmap` paints it with a dark
 * rim. bits.tsx's <PxIcon> shows it (with the old glyph as the fallback where there is no
 * canvas, e.g. tests).
 */
import { createBitmap, hex, outline, set, type Bitmap } from './bitmap'

export type IconName =
  | 'el-fire'
  | 'el-water'
  | 'el-wind'
  | 'el-earth'
  | 'el-light'
  | 'el-dark'
  | 'el-physical'
  | 'cls-warrior'
  | 'cls-spearman'
  | 'cls-thief'
  | 'cls-archer'
  | 'cls-mage'
  | 'cls-none'
  | 'trade'
  | 'gold'
  | 'gem'
  | 'menu'
  | 'sound-on'
  | 'sound-off'
  | 'settings'
  | 'keys'
  | 'save'
  | 'daily'
  | 'advice'
  | 'build'
  | 'heroes'
  | 'map'
  | 'flag-gb'
  | 'flag-fr'

interface IconDef {
  rows: string[]
  legend: Record<string, string>
  /** The emoji / glyph it replaces (the fallback where no canvas draws). */
  glyph: string
}

const RIM = '#1a1030'

export const ICONS: Record<IconName, IconDef> = {
  // ── Elements: a shape each ─────────────────────────────────────────────
  'el-fire': {
    glyph: '🔥',
    legend: { r: '#ff6b4a', y: '#ffd27a', d: '#c23a22' },
    rows: [
      '..r....r..',
      '..rr..rr..',
      '.rrr.rrr..',
      '.rrrrrrr.r',
      'rrryrrrrrr',
      'rryyyrryrr',
      'rryyyyyyrr',
      '.ryyyyyyr.',
      '.ddyyyydd.',
      '..dddddd..',
    ],
  },
  'el-water': {
    glyph: '💧',
    legend: { b: '#4aa3ff', l: '#cfeaff', d: '#2a64b8' },
    rows: [
      '.....b....',
      '....bb....',
      '....bbb...',
      '...bbbb...',
      '...bbbbb..',
      '..blbbbb..',
      '..blbbbbb.',
      '..bblbbbd.',
      '...bbbbd..',
      '....ddd...',
    ],
  },
  'el-wind': {
    glyph: '🍃',
    legend: { g: '#6be29a', d: '#2f9a5a' },
    rows: [
      '......gg..',
      '.ggggg..g.',
      '........g.',
      'ggggggggd.',
      '..........',
      '.gggggggg.',
      '.........g',
      '.dgggg...g',
      '......ggd.',
      '..........',
    ],
  },
  'el-earth': {
    glyph: '⛰️',
    legend: { e: '#c8a24a', l: '#f0d890', d: '#86662a' },
    rows: [
      '..........',
      '....l.....',
      '...lee....',
      '...leee.l.',
      '..leeeelee',
      '..eeeeeeee',
      '.leeedeeee',
      '.eeedddeee',
      'eeedddddee',
      'dddddddddd',
    ],
  },
  'el-light': {
    glyph: '☀️',
    legend: { s: '#ffe07a', w: '#fffbe6', o: '#e0a83a' },
    rows: [
      '....ss....',
      '.s..ss..s.',
      '..s....s..',
      '...ssss...',
      'ssswwwwsss',
      'ssswwwwsso',
      '...ssso...',
      '..s....o..',
      '.s..so..o.',
      '....oo....',
    ],
  },
  'el-dark': {
    glyph: '🌑',
    legend: { p: '#b07adb', l: '#d8b4f4', d: '#6a3a9a' },
    rows: [
      '...lppp...',
      '..lpp.....',
      '.lpp......',
      '.pp.......',
      'lpp.......',
      'ppp.......',
      '.pp.......',
      '.ppp....d.',
      '..pppppd..',
      '...dddd...',
    ],
  },
  'el-physical': {
    glyph: '⚔️',
    legend: { c: '#e4e8ee', s: '#9aa3b4', h: '#a8783a' },
    rows: [
      '.........c',
      '........cs',
      '.......cs.',
      '......cs..',
      '.....cs...',
      '.h..cs....',
      '..hcs.....',
      '..hh......',
      '.h..h.....',
      'h.........',
    ],
  },

  // ── Classes ─────────────────────────────────────────────────────────────
  'cls-warrior': {
    glyph: '🗡️',
    legend: { c: '#e4e8ee', s: '#9aa3b4', g: '#f2c75c', h: '#8a5a2a' },
    rows: [
      '....cs....',
      '....cs....',
      '....cs....',
      '....cs....',
      '....cs....',
      '....cs....',
      '..gggggg..',
      '....hh....',
      '....hh....',
      '....gg....',
    ],
  },
  'cls-spearman': {
    glyph: '🔱',
    legend: { c: '#e4e8ee', s: '#9aa3b4', h: '#a8783a' },
    rows: [
      '.c..c..c..',
      '.c..c..c..',
      '.cs.cs.cs.',
      '..ccccc...',
      '....h.....',
      '....h.....',
      '....h.....',
      '....h.....',
      '....h.....',
      '....h.....',
    ],
  },
  'cls-thief': {
    glyph: '🥷',
    legend: { k: '#5a5276', w: '#e4e8ee', r: '#ef5d6b' },
    rows: [
      '..kkkkkk..',
      '.kkkkkkkk.',
      'kkkkkkkkkk',
      'kwwkkkwwkk',
      'kkkkkkkkkk',
      '.kkkkkkkk.',
      '..kkkkkk..',
      '...rr.....',
      '..r..r....',
      '.r....r...',
    ],
  },
  'cls-archer': {
    glyph: '🏹',
    legend: { b: '#c08a4a', w: '#e4e8ee', a: '#9aa3b4' },
    rows: [
      '..bb......',
      '.b.w......',
      'b..w......',
      'b..w....a.',
      'b.aaaaaaaa',
      'b..w....a.',
      'b..w......',
      '.b.w......',
      '..bb......',
      '..........',
    ],
  },
  'cls-mage': {
    glyph: '🔮',
    legend: { o: '#b07adb', l: '#e8d0ff', h: '#8a5a2a', d: '#6a3a9a' },
    rows: [
      '...ooo....',
      '..olooo...',
      '..oooood..',
      '...oddd...',
      '....h.....',
      '....h.....',
      '....h.....',
      '....h.....',
      '....h.....',
      '...hhh....',
    ],
  },
  'cls-none': {
    glyph: '🔰',
    legend: { g: '#5fd08a', y: '#f2c75c', d: '#2f9a5a' },
    rows: [
      '....gg....',
      '...gggg...',
      '..gggyyy..',
      '..ggyyyy..',
      '..ggyyyy..',
      '..ggyyyy..',
      '..dgyyyd..',
      '...dgyd...',
      '....dd....',
      '..........',
    ],
  },
  trade: {
    glyph: '🏠',
    legend: { r: '#d06a4a', w: '#e8d8b8', d: '#6a4a2a' },
    rows: [
      '....rr....',
      '...rrrr...',
      '..rrrrrr..',
      '.rrrrrrrr.',
      'rrrrrrrrrr',
      '.wwwwwwww.',
      '.ww.wwddw.',
      '.ww.wwddw.',
      '.wwwwwddw.',
      '.wwwwwddw.',
    ],
  },

  // ── HUD ─────────────────────────────────────────────────────────────────
  gold: {
    glyph: '◆',
    legend: { g: '#f2c75c', l: '#fff0b0', d: '#b8862a' },
    rows: [
      '....gg....',
      '...glgg...',
      '..glggdg..',
      '.glgggddg.',
      'glggggdddg',
      'gggggggddg',
      '.ggggggdg.',
      '..ggggdg..',
      '...gddg...',
      '....gg....',
    ],
  },
  gem: {
    glyph: '♦',
    legend: { c: '#7fdcff', l: '#e0f8ff', b: '#3a8ad0', d: '#24508a' },
    rows: [
      '..........',
      '..cccccc..',
      '.clllccbb.',
      'cllcccbbbd',
      'cccccbbbdd',
      '.ccccbbdd.',
      '..cccbdd..',
      '...ccbd...',
      '....cd....',
      '..........',
    ],
  },
  menu: {
    glyph: '☰',
    legend: { w: '#f4ecd6' },
    rows: ['..........', '.wwwwwwww.', '.wwwwwwww.', '..........', '.wwwwwwww.', '.wwwwwwww.', '..........', '.wwwwwwww.', '.wwwwwwww.', '..........'],
  },
  'sound-on': {
    glyph: '🔊',
    legend: { w: '#f4ecd6', y: '#f2c75c' },
    rows: [
      '...w......',
      '..ww...y..',
      '.www.y..y.',
      'wwww..y.y.',
      'wwww..y.y.',
      'wwww..y.y.',
      '.www.y..y.',
      '..ww...y..',
      '...w......',
      '..........',
    ],
  },
  'sound-off': {
    glyph: '🔇',
    legend: { w: '#f4ecd6', r: '#ef5d6b' },
    rows: [
      '...w......',
      '..ww......',
      '.www.r..r.',
      'wwww..rr..',
      'wwww..rr..',
      'wwww.r..r.',
      '.www......',
      '..ww......',
      '...w......',
      '..........',
    ],
  },
  settings: {
    glyph: '⚙',
    legend: { s: '#cfd3da', d: '#8a90a0' },
    rows: [
      '....ss....',
      '.s.ssss.s.',
      '..ssssss..',
      '.sss..sss.',
      'ssss..ssss',
      'ssss..sssd',
      '.sss..ssd.',
      '..ssssdd..',
      '.s.sddd.d.',
      '....dd....',
    ],
  },
  keys: {
    glyph: '⌨',
    legend: { k: '#cfd3da', d: '#5a5276' },
    rows: [
      '..........',
      '..........',
      'kkkkkkkkkk',
      'kdkdkdkdkk',
      'kkkkkkkkkk',
      'kkdkdkdkdk',
      'kkkkkkkkkk',
      'kkdddddkkk',
      'kkkkkkkkkk',
      '..........',
    ],
  },
  save: {
    glyph: '💾',
    legend: { b: '#4a6ad0', w: '#e4e8ee', d: '#24357a', s: '#9aa3b4' },
    rows: [
      'bbbbbbbbb.',
      'bbwwwwwbbb',
      'bbwwwwwbbb',
      'bbwwwwwbbb',
      'bbbbbbbbbb',
      'bbbbbbbbbb',
      'bbsssssbbb',
      'bbssdssbbb',
      'bbssdssbbb',
      'dddddddddd',
    ],
  },
  daily: {
    glyph: '🎁',
    legend: { r: '#ef5d6b', y: '#f2c75c', d: '#a83a4a' },
    rows: [
      '..y...y...',
      '...y.y....',
      'rrrryrrrrr',
      'rrrryrrrrr',
      'yyyyyyyyyy',
      '.rrrydrrr.',
      '.rrrydrrr.',
      '.rrrydrrr.',
      '.rrrydrrr.',
      '.dddddddd.',
    ],
  },
  advice: {
    glyph: '💡',
    legend: { y: '#ffe07a', w: '#fffbe6', s: '#9aa3b4', d: '#e0a83a' },
    rows: [
      '...yyyy...',
      '..ywwyyy..',
      '.ywwyyyyy.',
      '.ywyyyyyd.',
      '.yyyyyyyd.',
      '..yyyyyd..',
      '...yyyd...',
      '...ssss...',
      '...ssss...',
      '....ss....',
    ],
  },
  build: {
    glyph: '🔨',
    legend: { m: '#cfd3da', d: '#8a90a0', h: '#a8783a' },
    rows: [
      '.mmmmmm...',
      'mmmmmmmd..',
      '.mmmmmdd..',
      '....h.....',
      '....h.....',
      '....h.....',
      '....h.....',
      '....h.....',
      '....h.....',
      '...hhh....',
    ],
  },
  heroes: {
    glyph: '👥',
    legend: { a: '#f2c75c', b: '#4aa3ff', s: '#f0c8a0' },
    rows: [
      '..ss...ss.',
      '.ssss.ssss',
      '.ssss.ssss',
      '..ss...ss.',
      '.aaaa.bbbb',
      'aaaaaabbbb',
      'aaaaaabbbb',
      'aaaaaabbbb',
      'aaaaaabbbb',
      '..........',
    ],
  },
  map: {
    glyph: '🗺',
    legend: { p: '#e8d8b8', g: '#5fd08a', r: '#ef5d6b', d: '#a8946a' },
    rows: [
      '..........',
      'ppdppdppp.',
      'pgdppdprp.',
      'ggdpgdppp.',
      'pgdggdpgp.',
      'ppdpgdggp.',
      'prdppdpgg.',
      'ppdppdppp.',
      '..........',
      '..........',
    ],
  },
  'flag-gb': {
    glyph: 'EN',
    legend: { b: '#2a3a8a', w: '#f4f4f4', r: '#d02a3a' },
    rows: [
      'rwbbbwrwbbbwr',
      'bwrbbwrwbbrwb',
      'bbwrbwrwbrwbb',
      'wwwwwwrwwwwww',
      'rrrrrrrrrrrrr',
      'wwwwwwrwwwwww',
      'bbwrbwrwbrwbb',
      'bwrbbwrwbbrwb',
      'rwbbbwrwbbbwr',
    ],
  },
  'flag-fr': {
    glyph: 'FR',
    legend: { b: '#2a4ab0', w: '#f4f4f4', r: '#e03a3a' },
    rows: ['bbbbwwwwrrrr', 'bbbbwwwwrrrr', 'bbbbwwwwrrrr', 'bbbbwwwwrrrr', 'bbbbwwwwrrrr', 'bbbbwwwwrrrr', 'bbbbwwwwrrrr', 'bbbbwwwwrrrr', 'bbbbwwwwrrrr'],
  },
}

/** Paint an icon (with a one-pixel dark rim around its shape). Pure. */
export function iconBitmap(name: IconName): Bitmap {
  const def = ICONS[name]
  const h = def.rows.length
  const w = Math.max(...def.rows.map((r) => r.length))
  const flag = name.startsWith('flag-')
  // Flags are cloth, not cut-outs: a frame instead of an outline.
  const b = createBitmap(w + 2, h + 2)
  for (let y = 0; y < h; y++) {
    const row = def.rows[y]!
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!
      if (ch === '.') continue
      const c = def.legend[ch]
      if (!c) throw new Error(`iconBitmap: '${name}' has no colour for '${ch}'`)
      set(b, x + 1, y + 1, hex(c))
    }
  }
  return outline(b, hex(flag ? '#0a0614' : RIM))
}

/** The silhouette of an icon: which cells are drawn (for the colour-blind test). */
export function iconMask(name: IconName): string {
  return ICONS[name].rows.map((r) => r.replace(/[^.]/g, '#')).join('/')
}
