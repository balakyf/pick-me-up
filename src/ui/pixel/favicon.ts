/**
 * The tab icon: the Mobius summon crystal (props.ts `summonCrystal`, frame 0) lifted off
 * its pedestal, centred on a square and written as a crisp SVG of pixel runs. The file
 * lives at public/favicon.svg; favicon.test.ts keeps it in step with the sprite
 * (`UPDATE_FAVICON=1 npx vitest run src/ui/pixel/favicon.test.ts` rewrites it).
 */
import { get, rgbaParts, type Bitmap } from './bitmap'
import { drawProp } from './props'

/** Rows of the crystal sprite above its stone pedestal. */
const GEM_ROWS = 29

/** The opaque bounds of `rows` top rows of a bitmap. */
function bounds(b: Bitmap, rows: number): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = b.w
  let y0 = rows
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < b.w; x++)
      if ((get(b, x, y) & 255) !== 0) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  return { x0, y0, x1, y1 }
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

/** An SVG drawing the top `rows` of `b`, cropped and centred on a square, one rect per run. */
export function bitmapToSvg(b: Bitmap, rows = b.h): string {
  const { x0, y0, x1, y1 } = bounds(b, rows)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const side = Math.max(w, h)
  const ox = Math.floor((side - w) / 2)
  const oy = Math.floor((side - h) / 2)
  const rects: string[] = []
  for (let y = y0; y <= y1; y++) {
    let x = x0
    while (x <= x1) {
      const c = get(b, x, y)
      if ((c & 255) === 0) {
        x++
        continue
      }
      let run = 1
      while (x + run <= x1 && get(b, x + run, y) === c) run++
      const [r, g, bl, a] = rgbaParts(c)
      const fill = `#${hex2(r)}${hex2(g)}${hex2(bl)}`
      rects.push(`<rect x="${x - x0 + ox}" y="${y - y0 + oy}" width="${run}" height="1" fill="${fill}"${a < 255 ? ` fill-opacity="${(a / 255).toFixed(2)}"` : ''}/>`)
      x += run
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">` +
    `<title>Pick Me Up!</title>` +
    rects.join('') +
    `</svg>\n`
  )
}

/** The game's favicon: the summon crystal. */
export function faviconSvg(): string {
  return bitmapToSvg(drawProp('summonCrystal', 0).bmp, GEM_ROWS)
}
