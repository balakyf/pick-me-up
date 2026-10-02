import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bitmapToSvg, faviconSvg } from './favicon'
import { createBitmap, hex, set } from './bitmap'

const ROOT = resolve(__dirname, '../../..')
const FILE = resolve(ROOT, 'public/favicon.svg')

describe('favicon', () => {
  it('turns pixel runs into rects on a square canvas', () => {
    const b = createBitmap(4, 4)
    set(b, 1, 1, hex('#ff0000'))
    set(b, 2, 1, hex('#ff0000'))
    set(b, 1, 3, hex('#00ff00'))
    const svg = bitmapToSvg(b)
    expect(svg).toContain('viewBox="0 0 3 3"')
    expect(svg).toContain('<rect x="0" y="0" width="2" height="1" fill="#ff0000"/>')
    expect(svg).toContain('<rect x="0" y="2" width="1" height="1" fill="#00ff00"/>')
  })

  it('public/favicon.svg is the summon crystal, and index.html links it', () => {
    const svg = faviconSvg()
    if (process.env.UPDATE_FAVICON) writeFileSync(FILE, svg)
    expect(existsSync(FILE)).toBe(true)
    expect(readFileSync(FILE, 'utf8')).toBe(svg)
    expect(readFileSync(resolve(ROOT, 'index.html'), 'utf8')).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg"')
  })
})
