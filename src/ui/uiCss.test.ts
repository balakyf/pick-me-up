import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** WP8 (spec 2026-10-12 V7): ui.css hygiene, the colour hierarchy and reduced motion. */
const css = readFileSync(fileURLToPath(new URL('./ui.css', import.meta.url)), 'utf8')
const rootEnd = css.indexOf('}', css.indexOf(':root'))
const root = css.slice(0, rootEnd)
const body = css.slice(rootEnd + 1)

describe('ui.css colour hierarchy (V7)', () => {
  it('defines the hierarchy tokens on :root', () => {
    for (const tok of ['--accent-cta', '--danger', '--neg', '--locked-opacity', '--r1', '--r5', '--r7']) {
      expect(root, tok).toMatch(new RegExp(`${tok}\\s*:`))
    }
  })

  it('keeps colour literals in :root (only #000 shadows and the dev gallery are exempt)', () => {
    const stray = body
      .split('\n')
      .filter((l) => /#[0-9a-fA-F]{3,8}\b/.test(l))
      .filter((l) => !/^\s*\.gallery/.test(l))
      .map((l) => l.replace(/#000\b/g, ''))
      .filter((l) => /#[0-9a-fA-F]{3,8}\b/.test(l))
    expect(stray).toEqual([])
  })

  it('the main action is gold, secondary/selected is purple', () => {
    expect(body).toMatch(/\.btn\.cta[^{]*\{[^}]*background:\s*var\(--accent-cta\)/)
    expect(body).toMatch(/\.btn\.primary\.big[^{]*\{[^}]*background:\s*var\(--accent-cta\)/)
    expect(body).toMatch(/\.btn\.primary, \.pbtn\.primary \{[^}]*background:\s*var\(--select\)/)
  })

  it('locked items are dimmed but not disabled', () => {
    const rule = body.match(/\.locked:not\(\.floor\):not\(\.lobby-portal\) \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('var(--locked-opacity)')
    expect(body).not.toMatch(/\.locked[^{]*\{[^}]*pointer-events:\s*none/)
    // the older uses keep their own look (the F90 danger badge stays red ahead of time)
    expect(body).toMatch(/\.floor\.locked \{ opacity: 0\.45; \}/)
  })

  it('only loaded font weights are used (Pixelify Sans ships 400–600)', () => {
    expect(css).not.toMatch(/font-weight:\s*(700|800|900|bold)\b/)
  })

  it('honours reduced motion: the OS setting and the in-game .reduce-motion class', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(css).toMatch(/\.reduce-motion \*/)
  })

  it('the idle breath is a crisp two-frame step (no half-pixel in-between)', () => {
    const rule = body.match(/\.idle-life \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('var(--idle-period')
    expect(rule).toContain('var(--idle-delay')
    expect(rule).toContain('steps(1, end)')
  })
})
