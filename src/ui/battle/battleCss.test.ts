import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Damage numbers under reduced motion (review finding #11). ui.css's global reduced-motion
 * rule forces every animation to `animation-duration: 0.001ms !important`; the numbers'
 * pop (and the old calm fade) end at opacity 0 with `forwards`, so under that rule they
 * finished at once and stayed invisible. Under reduced motion — the in-game setting
 * (`.battle.calm`, `.reduce-motion` on <html>) or the OS one — they must carry no
 * animation at all (`animation: none !important`), and so sit still and stay readable.
 */
const css = readFileSync(fileURLToPath(new URL('./battle.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const ui = readFileSync(fileURLToPath(new URL('../ui.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The declarations of every top-level rule (or of the rules inside `within`). */
function rules(src: string): { selectors: string[]; body: string }[] {
  const out: { selectors: string[]; body: string }[] = []
  for (const m of src.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) out.push({ selectors: m[1]!.split(',').map((s) => s.trim()), body: m[2]! })
  return out
}
const media = (src: string): string => {
  const at = src.indexOf('@media (prefers-reduced-motion: reduce)')
  if (at < 0) return ''
  let depth = 0
  let i = src.indexOf('{', at)
  const start = i + 1
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    if (src[i] === '}' && --depth === 0) break
  }
  return src.slice(start, i)
}
const stillUnder = (src: string, sel: (s: string) => boolean) =>
  rules(src).some((r) => r.selectors.some(sel) && /animation\s*:\s*none\s*!important/.test(r.body))

describe('damage numbers under reduced motion', () => {
  it('the global reduced-motion rule is what collapses animations (the premise of this test)', () => {
    expect(ui).toMatch(/\.reduce-motion \*[^{]*\{[^}]*animation-duration:\s*0\.001ms !important/)
    expect(media(ui)).toMatch(/animation-duration:\s*0\.001ms !important/)
  })

  it('in calm mode the numbers carry no animation', () => {
    expect(stillUnder(css, (s) => /^\.battle\.calm\b.*\.dmg$/.test(s))).toBe(true)
  })

  it('with .reduce-motion on <html> (even with calm off) the numbers carry no animation', () => {
    expect(stillUnder(css, (s) => /^\.reduce-motion\b.*\.dmg$/.test(s))).toBe(true)
  })

  it('with the OS setting (even with the in-game one off) the numbers carry no animation', () => {
    expect(stillUnder(media(css), (s) => /\.dmg$/.test(s))).toBe(true)
  })

  it('no reduced-motion rule animates the numbers to a fade that ends invisible', () => {
    for (const r of rules(css))
      if (r.selectors.some((s) => /(calm|reduce-motion).*\.dmg$/.test(s))) expect(r.body).not.toMatch(/animation\s*:\s*(?!none)\w/)
  })
})
