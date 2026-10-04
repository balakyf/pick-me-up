/**
 * Lane Q: the last seven bosses at native resolution, in lane I's manner (bossSprite.ts):
 * side view facing RIGHT toward the party, shapes shaded from their own silhouettes by
 * `shape.paint`, an authored second idle frame, the universal ink outline. Pure and
 * deterministic (flecks come from `rand.ts`).
 *
 * The Lizardman Chief (F25), Kurushahr (F30), the Ancient Stone Statue (F30), the Kraken
 * (F35), the Order Inquisitor (F48), the Order's Saint (F55) and the Fragment Colossus
 * (F75, and the guild's weekly Colossus).
 */
import { createBitmap, hex, hline, line, mix, outline, rect, set, vline, withAlpha, type Bitmap } from './bitmap'
import { BONE, GOLD, INK, LEATHER, STEEL, ramp, type Ramp } from './palette'
import { arc, disc, paint, poly, thick, type Pt } from './shape'
import { BLOOD_CAPE, FAIR, P, PALE, WHITE, WOOD_DARK, cape, dy, far, head, sprinkle, type IdleFrame } from './bossSprite'

const SCALE = ramp('#1e3a1e', '#3e6e32', '#7aa850')
const BELLY = ramp('#8a8a4a', '#c8c07a', '#ece6aa')
const REED_GOLD = ramp('#6a4a14', '#b08a2a', '#f0d070')

// ─────────────────────────────────────────────────────────────────────────────
// The Lizardman Chief, Lord of the Drowned Reeds (F25): a hulking lizard in a cape of
// woven reed-gold, a crown of fish bones, a barbed trident levelled at the party, a heavy
// tail sweeping the floor behind him.
// ─────────────────────────────────────────────────────────────────────────────

export function drawLizardChief(f: IdleFrame): Bitmap {
  const W = 56
  const H = 58
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  // the tail, thick at the hip, curling along the floor behind him
  paint(b, (m) => {
    thick(m, 18, 40, 10, 50, 6, 1)
    thick(m, 10, 50, 3, 54 - f, 4, 1)
    thick(m, 3, 54 - f, 1, 49 - f, 2, 1)
  }, SCALE, { light: 'right' })
  cape(b, 20, 22 + br, 28, 12, REED_GOLD, ramp('#2a3a1a', '#3a5a2a', '#5a8a3a'), f)
  // far arm (behind), far leg
  paint(b, (m) => thick(m, 22, 26 + br, 19, 37 + br, 5, 1), far(SCALE))
  // digitigrade legs: a thick thigh, the shin raking back, a clawed foot forward
  paint(b, (m) => {
    thick(m, 22, 41, 18, 48, 6, 1)
    thick(m, 18, 48, 20, g - 2, 4, 1)
    poly(m, P(17, g - 3, 26, g - 2, 27, g, 17, g), 1)
  }, far(SCALE))
  paint(b, (m) => {
    thick(m, 29, 41, 33, 48, 7, 1)
    thick(m, 33, 48, 30, g - 2, 5, 1)
    poly(m, P(28, g - 3, 38, g - 2, 39, g, 28, g), 1)
  }, SCALE)
  for (const x of [26, 38]) set(b, x, g, BONE.l) // claws
  // the loincloth and a belt of shells
  paint(b, (m) => poly(m, P(20, 38 + br, 34, 38 + br, 35, 46, 31, 49, 27, 44, 22, 49, 19, 46), 1), ramp('#5a1414', '#8a2424', '#c04040'))
  for (let x = 21; x < 34; x += 3) set(b, x, 38 + br, BONE.l)
  // a barrel of a body, the pale belly scaled in rows
  paint(b, (m) => poly(m, dy(P(19, 21, 32, 19, 37, 25, 37, 35, 34, 40, 21, 40, 17, 31), br), 1), SCALE, { rim: 2 })
  paint(b, (m) => poly(m, dy(P(29, 22, 35, 26, 35, 35, 32, 39, 27, 38, 27, 26), br), 1), BELLY, { light: 'right' })
  for (let y = 26; y < 38; y += 3) hline(b, 28, y + br, 7, BELLY.d)
  // spines down the back of his head and neck
  for (let i = 0; i < 5; i++) poly(b, dy(P(18 + i * 2, 12 + i * 2, 15 + i * 2, 9 + i * 2, 19 + i * 2, 11 + i * 2), br), REED_GOLD.m)
  // the head: a long snout, a jaw full of teeth, a yellow eye under a heavy brow
  paint(b, (m) => poly(m, dy(P(21, 9, 30, 8, 36, 11, 44, 13, 45, 16, 38, 18, 30, 21, 22, 20, 19, 14), br), 1), SCALE, { rim: 2 })
  paint(b, (m) => poly(m, dy(P(29, 17, 37, 17, 44, 17, 40, 21, 30, 22), br), 1), BELLY) // the lower jaw
  for (let x = 31; x < 44; x += 2) set(b, x, 17 + br, WHITE) // teeth
  set(b, 43, 13 + br, INK) // nostril
  hline(b, 27, 11 + br, 4, SCALE.d) // brow
  set(b, 29, 12 + br, hex('#ffd24a'))
  set(b, 30, 12 + br, INK)
  // a crown of fish bones
  for (const [x, h] of [[21, 5], [24, 7], [27, 6], [30, 4]] as const) {
    vline(b, x, 9 - h + br, h, BONE.l)
    set(b, x - 1, 9 - h + 2 + br, BONE.m)
    set(b, x + 1, 9 - h + 2 + br, BONE.m)
  }
  hline(b, 20, 9 + br, 12, REED_GOLD.m)
  // the near arm, scaled and clawed, gripping the trident at his hip
  paint(b, (m) => {
    thick(m, 30, 24 + br, 34, 31 + br, 5, 1)
    thick(m, 34, 31 + br, 39, 33 + br, 4, 1)
  }, SCALE)
  // the trident: a long shaft levelled forward, three barbed tines
  const ty = 33 + br
  line(b, 14, ty + 6, 51, ty - 5, WOOD_DARK)
  line(b, 14, ty + 7, 51, ty - 4, hex('#7a5030'))
  const tx = 51
  const tip = ty - 5
  paint(b, (m) => {
    rect(m, tx - 1, tip - 5, 2, 11, 1) // the crossbar
    thick(m, tx, tip - 5, tx + 4, tip - 6, 2, 1)
    thick(m, tx, tip, tx + 5, tip - 1, 2, 1)
    thick(m, tx, tip + 5, tx + 4, tip + 4, 2, 1)
  }, STEEL)
  for (const dyT of [-6, -1, 4]) set(b, tx + 4, tip + dyT - 1, WHITE) // barbs
  rect(b, 38, 31 + br, 3, 3, SCALE.l) // the claw on the shaft
  // drowned reeds and water at his feet
  for (let i = 0; i < 4; i++) vline(b, 42 + i * 3, g - 6 + (i % 2) - (i === 1 ? f : 0), 6 - (i % 2), i % 2 ? SCALE.l : SCALE.m)
  hline(b, 0, g, W, withAlpha(hex('#3a7ad0'), 0x90))
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// Kurushahr, Keeper of the Truth (F30): a tall pale sage in a robe the colour of deep
// water, a hood under a golden circlet, eyes that shine like ice, the staff of the truth
// crowned with an orb — and the truth's pages turning in the air around him.
// ─────────────────────────────────────────────────────────────────────────────

export function drawKurushahr(f: IdleFrame): Bitmap {
  const W = 50
  const H = 64
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  const robe = ramp('#141032', '#2a2462', '#4a44a0')
  const ice = hex('#7af0ff')
  const page = ramp('#a8a080', '#e8e0c8', '#fffaf0')
  // the staff behind the near hand: a crook of dark wood, the orb in its cradle
  vline(b, 37, 8, g - 8, WOOD_DARK)
  vline(b, 38, 10, g - 10, hex('#6a4a2a'))
  arc(b, 38, 7, 5, GOLD.m, 0.5, 1.25)
  disc(b, 38, 7, 3, f ? hex('#bff8ff') : ice)
  set(b, 37, 6, WHITE)
  arc(b, 38, 7, 6, withAlpha(ice, 0x60), 0, 1)
  // a long stole behind him, swaying
  cape(b, 18, 18 + br, 38, 9, robe, null, f)
  // the robe to the floor, flaring at the hem
  paint(b, (m) => poly(m, dy(P(16, 18, 28, 17, 31, 26, 34, 48, 38, g - 1 - br, 8, g - 1 - br, 12, 46, 14, 28), br), 1), robe, { rim: 2 })
  for (const [x0, x1] of [[19, 14], [24, 24], [29, 33]] as const) line(b, x0, 32 + br, x1, g - 3, robe.d) // folds
  hline(b, 8, g - 2, 30, GOLD.m)
  hline(b, 9, g - 3, 28, GOLD.d)
  // the stole down the front, with the eye of the truth embroidered
  paint(b, (m) => poly(m, dy(P(25, 18, 28, 18, 31, g - 4, 27, g - 4), br), 1), GOLD)
  disc(b, 28, 32 + br, 1, ice)
  // the face under the hood: pale, ageless, the eyes alight
  head(b, 18, 7 + br, PALE, ice, { w: 9, h: 10 })
  set(b, 25, 12 + br, withAlpha(ice, 0x90)) // the glow spilling from the eye
  paint(b, (m) => poly(m, dy(P(16, 8, 21, 3, 27, 4, 29, 8, 26, 8, 21, 9, 19, 16, 18, 20, 14, 18, 15, 11), br), 1), robe, { rim: 2 })
  hline(b, 19, 7 + br, 9, GOLD.m) // the circlet
  set(b, 27, 7 + br, ice)
  // a long white beard
  paint(b, (m) => poly(m, dy(P(22, 16, 27, 16, 27, 24, 24, 28, 22, 22), br), 1), ramp('#a8a8b8', '#e0e0ec', '#ffffff'))
  // the near sleeve, wide, to the staff
  paint(b, (m) => poly(m, dy(P(23, 20, 28, 19, 37, 26, 35, 30, 26, 27), br), 1), robe)
  rect(b, 36, 25 + br, 2, 3, PALE.m)
  // the truth's pages, turning around him
  const pages: Pt[] = f ? P(3, 22, 42, 36, 6, 40, 44, 16) : P(4, 26, 43, 40, 3, 36, 42, 20)
  pages.forEach(([x, y], i) => {
    paint(b, (m) => rect(m, x, y, 4, 5, 1), page)
    hline(b, x + 1, y + 2, 2, i % 2 ? GOLD.d : robe.m)
  })
  sprinkle(b, `kuru|${f}`, 2, 4, 46, 50, 6, [withAlpha(ice, 0xb0), withAlpha(WHITE, 0x90)])
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// The Ancient Stone Statue, Older Than the Tower (F30): a guardian carved before the tower
// rose — a broad weathered figure of grey stone, moss in its seams, a stone halberd, and
// runes on its chest and in its eyes that burn when it moves.
// ─────────────────────────────────────────────────────────────────────────────

export function drawStoneStatue(f: IdleFrame): Bitmap {
  const W = 62
  const H = 72
  const g = H - 1
  const b = createBitmap(W, H)
  const stone = ramp('#4a4a50', '#7e7c80', '#b4b2ae')
  const moss = hex('#5a7a3a')
  const rune = f ? hex('#ffd07a') : hex('#ff7a3a')
  const glow = withAlpha(hex('#ff7a3a'), 0x70)
  // the plinth it was carved on, cracked
  paint(b, (m) => rect(m, 6, g - 7, 48, 8, 1), ramp('#3a3a40', '#5e5c62', '#8a888c'))
  line(b, 22, g - 7, 26, g, INK)
  line(b, 40, g - 7, 37, g - 2, INK)
  // the halberd, held upright on the far side
  vline(b, 47, 2, g - 9, WOOD_DARK)
  vline(b, 48, 4, g - 11, stone.d)
  paint(b, (m) => {
    poly(m, P(48, 6, 58, 3, 60, 10, 56, 16, 48, 14), 1) // the blade
    poly(m, P(46, 9, 41, 12, 46, 14), 1) // the back spike
    poly(m, P(46, 0, 49, 0, 48, 6), 1)
  }, stone)
  line(b, 58, 4, 56, 15, stone.l)
  // legs like columns
  paint(b, (m) => rect(m, 17, 46, 10, g - 54, 1), far(stone))
  paint(b, (m) => rect(m, 30, 46, 11, g - 54, 1), stone)
  hline(b, 17, 52, 10, stone.d)
  hline(b, 30, 52, 11, stone.d)
  // a skirt of carved stone plates
  paint(b, (m) => poly(m, P(13, 40, 45, 40, 47, 50, 11, 50), 1), stone)
  for (let x = 15; x < 46; x += 6) vline(b, x, 41, 9, stone.d)
  // the torso: a block, the runes in a circle on the chest
  paint(b, (m) => poly(m, P(12, 18, 44, 16, 48, 24, 46, 41, 13, 41, 10, 26), 1), stone, { rim: 2 })
  arc(b, 29, 29, 6, rune, 0, 1)
  vline(b, 29, 25, 9, rune)
  hline(b, 25, 29, 9, rune)
  arc(b, 29, 29, 8, glow, 0, 1)
  // cracks and moss, seeded
  line(b, 16, 20, 20, 30, INK)
  line(b, 40, 18, 37, 26, INK)
  sprinkle(b, 'statue|moss', 11, 16, 36, 30, 22, [moss, mix(moss, stone.m, 0.5)])
  // the shoulders: great carved pauldrons
  paint(b, (m) => {
    disc(m, 13, 20, 6, 1)
    disc(m, 43, 19, 6, 1)
  }, stone)
  // arms: the far one at its side, the near one gripping the halberd's shaft
  paint(b, (m) => thick(m, 11, 22, 8, 38, 6, 1), far(stone))
  rect(b, 5, 38, 7, 6, far(stone).m) // the far fist
  paint(b, (m) => {
    thick(m, 43, 22, 45, 32, 6, 1)
    thick(m, 45, 32, 47, 30, 5, 1)
  }, stone)
  rect(b, 44, 28, 7, 7, stone.l) // the fist on the shaft
  hline(b, 44, 31, 7, stone.d)
  // the head: a weathered helm-face, eyes of fire
  paint(b, (m) => poly(m, P(21, 4, 35, 3, 38, 7, 38, 16, 33, 19, 23, 19, 20, 14), 1), stone, { rim: 2 })
  hline(b, 21, 4, 15, stone.l)
  hline(b, 28, 10, 9, INK)
  hline(b, 31, 10, 2, rune)
  hline(b, 35, 10, 2, rune)
  vline(b, 30, 12, 6, stone.d) // the carved nose and mouth
  hline(b, 30, 16, 6, stone.d)
  sprinkle(b, 'statue|head', 21, 4, 16, 14, 5, [moss])
  // embers rising from the runes on the second frame
  if (f) sprinkle(b, 'statue|embers', 22, 18, 14, 10, 4, [hex('#ffd07a'), hex('#ff7a3a')])
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// The Kraken, Terror of the Undertow (F35, a lieutenant): a vast purple mantle rising out
// of the surf, one great golden eye, tentacles reaching forward over the water to drag the
// party under.
// ─────────────────────────────────────────────────────────────────────────────

export function drawKraken(f: IdleFrame): Bitmap {
  const W = 66
  const H = 58
  const g = H - 1
  const b = createBitmap(W, H)
  const flesh = ramp('#3a143e', '#70306e', '#a8609e')
  const sucker = hex('#e0a8d0')
  const sea = ramp('#0e2a5a', '#2a5aa0', '#9ad4ff')
  // tentacles behind the mantle, curling up into the air
  const back: [number, number][][] = [
    [[16, 40], [8, 30], [6, 18], [12, 10 + f]],
    [[24, 42], [22, 30], [28, 22 - f], [34, 20]],
  ]
  for (const path of back)
    for (let i = 0; i + 1 < path.length; i++) {
      const [x0, y0] = path[i]!
      const [x1, y1] = path[i + 1]!
      paint(b, (m) => thick(m, x0, y0, x1, y1, Math.max(2, 5 - i), 1), far(flesh))
    }
  // the mantle: a great swelling head leaning toward the party
  paint(b, (m) => poly(m, P(14, 18, 20, 6, 30, 1, 40, 3, 46, 12, 46, 28, 42, 40, 18, 42, 12, 32), 1), flesh, { rim: 2 })
  for (let i = 0; i < 6; i++) set(b, 20 + i * 4, 10 + (i % 3) * 5, flesh.l) // mottling
  sprinkle(b, 'kraken|spots', 16, 6, 26, 30, 10, [flesh.d, mix(flesh.d, INK, 0.4)])
  // the eye: gold, a slit pupil, a heavy lid
  disc(b, 38, 24, 5, hex('#ffe07a'))
  disc(b, 38, 24, 3, hex('#f0a830'))
  vline(b, 39, 20, 9, INK)
  set(b, 36, 22, WHITE)
  if (f) hline(b, 33, 20, 11, flesh.d) // the lid lowers
  arc(b, 38, 24, 6, flesh.d, 0.55, 0.95)
  // tentacles reaching forward over the water, suckers underneath
  const reach: [number, number][][] = [
    [[40, 38], [50, 34], [58, 28 - f], [63, 30 - f], [62, 35]],
    [[36, 41], [46, 44], [56, 42 + f], [62, 46 + f]],
    [[26, 42], [30, 50], [40, 52], [48, 50 - f]],
  ]
  reach.forEach((path, k) => {
    for (let i = 0; i + 1 < path.length; i++) {
      const [x0, y0] = path[i]!
      const [x1, y1] = path[i + 1]!
      paint(b, (m) => thick(m, x0, y0, x1, y1, Math.max(2, 5 - i), 1), flesh, { light: 'right' })
      if (i < path.length - 2) set(b, Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2) + 2, sucker)
    }
    void k
  })
  // the surf it rises from
  for (let y = g - 6; y <= g; y++) {
    for (let x = 0; x < W; x++) {
      const crest = Math.round(Math.sin((x + f * 3) / 4) * 1.5)
      if (y >= g - 5 + crest) set(b, x, y, y === g - 5 + crest ? sea.l : y < g - 2 ? sea.m : sea.d)
    }
  }
  for (let x = 4 + f; x < W; x += 9) set(b, x, g - 7, WHITE) // foam
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// The Order Inquisitor, Hand of the Purge (F48): a tall hooded judge in white and gold, a
// featureless gilt mask, a red sash of office, the Book of Sentences open in one hand and a
// censer of holy fire swinging on its chain in the other.
// ─────────────────────────────────────────────────────────────────────────────

export function drawInquisitor(f: IdleFrame): Bitmap {
  const W = 52
  const H = 60
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  const robe = ramp('#8a8070', '#e4dcc8', '#fffaf0')
  const red = BLOOD_CAPE
  const mask = ramp('#8a6a1a', '#d8b040', '#fff0a0')
  const fire = f ? hex('#fff0a0') : hex('#ffb040')
  // the mantle behind him, gold-edged
  cape(b, 17, 18 + br, 36, 11, ramp('#5a4a14', '#a8903a', '#e0c870'), red, f)
  // the robe to the floor
  paint(b, (m) => poly(m, dy(P(15, 18, 27, 17, 30, 26, 33, g - 2 - br, 7, g - 2 - br, 11, 26), br), 1), robe, { rim: 2 })
  for (const [x0, x1] of [[18, 13], [24, 25]] as const) line(b, x0, 30 + br, x1, g - 4, robe.d)
  hline(b, 7, g - 2, 27, GOLD.m)
  // the tabard: the Order's sun on red
  paint(b, (m) => poly(m, dy(P(20, 20, 27, 20, 29, 46, 18, 46), br), 1), red)
  disc(b, 24, 30 + br, 2, GOLD.l)
  for (const [dx, dyy] of [[0, -4], [0, 4], [-4, 0], [4, 0]] as const) set(b, 24 + dx, 30 + br + dyy, GOLD.m)
  // the tall hood and the gilt mask
  paint(b, (m) => poly(m, dy(P(16, 8, 20, -2, 27, 2, 30, 8, 30, 16, 25, 18, 18, 18, 14, 13), br), 1), robe, { rim: 2 })
  paint(b, (m) => poly(m, dy(P(22, 6, 29, 6, 30, 14, 27, 17, 23, 16, 21, 11), br), 1), mask)
  hline(b, 25, 10 + br, 4, INK) // the eye slit
  set(b, 28, 10 + br, hex('#ff3a2e'))
  vline(b, 26, 12 + br, 3, mask.d)
  line(b, 20, -1 + br, 26, 4 + br, GOLD.m) // the hood's gilt seam
  // the far arm holds the Book of Sentences open
  paint(b, (m) => thick(m, 17, 22 + br, 12, 30 + br, 4, 1), far(robe))
  paint(b, (m) => poly(m, dy(P(4, 28, 12, 26, 14, 34, 6, 36), br), 1), ramp('#3a0a14', '#6a1424', '#a02a3a'))
  rect(b, 6, 28 + br, 6, 6, hex('#f4ecd8'))
  vline(b, 9, 28 + br, 6, LEATHER.d)
  for (const y of [29, 31, 33]) hline(b, 6, y + br, 2, hex('#6a5a48'))
  // the near arm swings the censer on its chain
  paint(b, (m) => {
    thick(m, 26, 21 + br, 32, 28 + br, 4, 1)
    thick(m, 32, 28 + br, 36, 26 + br, 3, 1)
  }, robe)
  rect(b, 36, 24 + br, 2, 3, FAIR.m)
  const sw = f ? 2 : 0
  line(b, 38, 25 + br, 43 + sw, 38, STEEL.l)
  line(b, 37, 25 + br, 42 + sw, 38, STEEL.d)
  const cx = 43 + sw
  paint(b, (m) => {
    disc(m, cx, 41, 4, 1)
    rect(m, cx - 3, 37, 7, 2, 1)
  }, GOLD)
  for (let i = 0; i < 3; i++) set(b, cx - 2 + i * 2, 41, INK) // the vents
  // holy fire and smoke curling from it
  poly(b, P(cx - 2, 37, cx, 31 - f, cx + 2, 37), fire)
  set(b, cx, 35, WHITE)
  sprinkle(b, `inq|smoke|${f}`, cx - 6, 24, 10, 10, 5, [withAlpha(hex('#e0d8e8'), 0x90), withAlpha(hex('#b0a8b8'), 0x70)])
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// The Order's Saint, Light of the Crusade (F55): a woman in white and gold with long golden
// hair, a halo of light, wings of light half-open behind her, and the sun-staff of the
// crusade raised before the party.
// ─────────────────────────────────────────────────────────────────────────────

export function drawSaint(f: IdleFrame): Bitmap {
  const W = 56
  const H = 66
  const g = H - 1
  const b = createBitmap(W, H)
  const br = f
  const robe = ramp('#a8a0b8', '#ece6f4', '#ffffff')
  const hair = ramp('#a87a1a', '#e0b84a', '#fff0a0')
  const light = hex('#fff6c0')
  // wings of light: feathered fans, translucent
  for (let i = 0; i < 6; i++) {
    const a = 0.62 + i * 0.07 + f * 0.015
    const len = 22 - i * 2
    const x1 = Math.round(20 - Math.cos(a * Math.PI) * -len)
    const y1 = Math.round(22 - Math.sin(a * Math.PI) * len)
    thick(b, 20, 22 + br, x1, y1 + br, 3, withAlpha(i % 2 ? light : hex('#ffe8a0'), 0xa0))
  }
  // the halo
  arc(b, 25, 9 + br, 9, GOLD.l, 0, 1)
  arc(b, 25, 9 + br, 10, withAlpha(GOLD.m, 0x90), 0, 1)
  for (let i = 0; i < 8; i++) {
    const a = ((i + f * 0.5) / 8) * Math.PI * 2
    set(b, Math.round(25 + Math.cos(a) * 12), Math.round(9 + br + Math.sin(a) * 12), withAlpha(light, 0xc0))
  }
  // long hair falling down her back, swaying
  paint(b, (m) => poly(m, dy(P(20, 6, 26, 4, 30, 8, 26, 12, 23, 20, 22, 32, 18 - f, 38, 15 - f, 30, 16, 16), br), 1), hair, { light: 'right' })
  // the robe: a long gown pooling at the floor, a gold-trimmed overdress
  paint(b, (m) => poly(m, dy(P(17, 20, 29, 19, 32, 28, 36, 50, 40, g - 1 - br, 10, g - 1 - br, 14, 48, 15, 30), br), 1), robe, { rim: 2 })
  for (const [x0, x1] of [[20, 15], [26, 27], [31, 36]] as const) line(b, x0, 34 + br, x1, g - 3, robe.d)
  hline(b, 10, g - 2, 30, GOLD.m)
  hline(b, 11, g - 3, 28, GOLD.l)
  paint(b, (m) => poly(m, dy(P(23, 20, 29, 20, 32, 34, 22, 34), br), 1), ramp('#a87a1a', '#e0b84a', '#fff0a0')) // the bodice
  hline(b, 21, 34 + br, 12, GOLD.d)
  // her face, serene, eyes of clear blue, a circlet
  head(b, 20, 8 + br, FAIR, hex('#2a6ab8'), { w: 9, h: 10 })
  paint(b, (m) => poly(m, dy(P(20, 7, 27, 6, 30, 9, 29, 10, 24, 10, 22, 13, 20, 12), br), 1), hair)
  hline(b, 21, 9 + br, 8, GOLD.l)
  set(b, 28, 9 + br, hex('#9ad4ff'))
  // the near arm raises the sun-staff
  paint(b, (m) => {
    thick(m, 27, 22 + br, 33, 26 + br, 4, 1)
    thick(m, 33, 26 + br, 37, 20 + br, 3, 1)
  }, robe)
  rect(b, 36, 18 + br, 2, 3, FAIR.m)
  const sx = 38
  line(b, sx, 4, sx - 4, g - 4, GOLD.d)
  line(b, sx + 1, 4, sx - 3, g - 4, GOLD.m)
  disc(b, sx + 1, 4, 3, f ? WHITE : light)
  for (let i = 0; i < 8; i++) {
    const a = ((i + f * 0.5) / 8) * Math.PI * 2
    line(b, Math.round(sx + 1 + Math.cos(a) * 4), Math.round(4 + Math.sin(a) * 4), Math.round(sx + 1 + Math.cos(a) * 7), Math.round(4 + Math.sin(a) * 7), GOLD.l)
  }
  sprinkle(b, `saint|motes|${f}`, 6, 14, 46, 40, 7, [withAlpha(light, 0xc0), withAlpha(GOLD.l, 0xa0)])
  return outline(b, INK)
}

// ─────────────────────────────────────────────────────────────────────────────
// The Fragment Colossus, the Wall Given Legs (F75; the guild's weekly Colossus): a giant
// built of the Wailing Wall's own broken blocks, held together by violet light — its
// pieces hover a hair apart and drift, a core blazing in its chest.
// ─────────────────────────────────────────────────────────────────────────────

export function drawFragmentColossus(f: IdleFrame): Bitmap {
  const W = 68
  const H = 82
  const g = H - 1
  const b = createBitmap(W, H)
  const block = ramp('#1a1230', '#3a2c62', '#6a5aa0')
  const seam = hex('#c8b8ff')
  const core = f ? hex('#ffffff') : hex('#e0d0ff')
  const lift = (n: number) => (f ? n : 0) // a block drifts a pixel on the second frame
  /** One floating block: a shaded slab with a light seam on its top edge. */
  const slab = (x: number, y: number, w: number, h: number, mat: Ramp = block) => {
    paint(b, (m) => rect(m, x, y, w, h, 1), mat, { rim: 1 })
    hline(b, x + 1, y, w - 2, withAlpha(seam, 0x90))
  }
  // the violet light binding it, behind everything
  for (const [x, y, r] of [[34, 34, 22], [34, 58, 14]] as const) arc(b, x, y, r, withAlpha(seam, 0x40), 0, 1)
  // legs: stacks of blocks, a gap of light between each
  slab(18, 58, 11, 8)
  slab(17, 67, 12, 7 + lift(0))
  slab(15, g - 6, 15, 7)
  slab(38, 58 - lift(1), 12, 8, far(block))
  slab(38, 67 - lift(1), 12, 7, far(block))
  slab(37, g - 6, 15, 7, far(block))
  // the hips
  slab(16, 50, 36, 7)
  // the torso: three courses of masonry around the core
  slab(14, 38, 40, 11)
  slab(12, 26, 44, 11)
  slab(16, 16, 36, 9)
  for (let x = 20; x < 54; x += 9) vline(b, x, 27, 10, block.d) // mortar lines
  for (let x = 24; x < 50; x += 9) vline(b, x, 39, 10, block.d)
  // the core, blazing through a breach in the chest
  poly(b, P(28, 27, 40, 27, 42, 34, 38, 40, 30, 40, 26, 34), hex('#0a0614'))
  disc(b, 34, 33, 4, withAlpha(seam, 0xd0))
  disc(b, 34, 33, 2, core)
  for (let i = 0; i < 6; i++) {
    const a = ((i + f * 0.5) / 6) * Math.PI * 2
    set(b, Math.round(34 + Math.cos(a) * 6), Math.round(33 + Math.sin(a) * 6), seam)
  }
  // the arms: the far one hanging, the near one a battering ram of blocks forward
  slab(4, 24 - lift(1), 8, 10, far(block))
  slab(3, 35 - lift(1), 8, 10, far(block))
  slab(2, 46 - lift(1), 10, 9, far(block))
  slab(55, 26 + lift(1), 9, 9)
  slab(56, 36 + lift(1), 9, 9)
  slab(54, 46 + lift(1), 13, 11)
  for (let x = 56; x < 66; x += 3) set(b, x, 56 + lift(1), seam) // knuckles of light
  // the head: a single block with a slit of light, a broken crown of the Wall's parapet
  slab(25, 4 - lift(1), 18, 11)
  hline(b, 30, 9 - lift(1), 11, INK)
  hline(b, 33, 9 - lift(1), 6, core)
  for (let x = 26; x < 42; x += 4) rect(b, x, 1 - lift(1), 2, 3, block.l)
  // shards orbiting it
  const shards: Pt[] = f ? P(6, 10, 60, 14, 2, 62, 62, 66) : P(8, 12, 61, 18, 4, 64, 60, 70)
  for (const [x, y] of shards) {
    poly(b, P(x, y + 3, x + 2, y, x + 4, y + 3, x + 2, y + 6), block.l)
    set(b, x + 2, y + 2, seam)
  }
  const out = outline(b, INK)
  // The light that binds it shows in the seams between its courses (over the ink the
  // outline laid there): wherever a block sits above and below, the gap glows.
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? out.px[y * W + x]! : 0)
  for (const y of [15, 25, 37, 49, 57, 66 - lift(1)]) {
    for (let x = 0; x < W; x++) {
      const up = at(x, y - 1)
      const down = at(x, y + 1)
      if (up !== 0 && up !== INK && down !== 0 && down !== INK) set(out, x, y, (x + y + f) % 3 === 0 ? core : seam)
    }
  }
  return out
}

/** Every late boss's drawer, by template id (lane Q). */
export const LATE_BOSSES: Record<string, (f: IdleFrame) => Bitmap> = {
  lizard_chief: drawLizardChief,
  kurushahr: drawKurushahr,
  stone_statue: drawStoneStatue,
  kraken: drawKraken,
  order_inquisitor: drawInquisitor,
  order_saint: drawSaint,
  fragment_colossus: drawFragmentColossus,
}
