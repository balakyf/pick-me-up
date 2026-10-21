// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clearanceStyle, hudClearance } from './hudClearance'

/**
 * Phone layout (playtest: the one-time backup nudge sat over the goal tracker at 390x844,
 * and "Rest for now" over the Daily button). The bottom prompts now sit on the measured
 * height of the lobby's HUD bar; real layouts are checked in Chromium (see return.css).
 */

let stage: HTMLElement | null = null
afterEach(() => {
  stage?.remove()
  stage = null
})

function bar(top: number): void {
  stage = document.createElement('div')
  stage.className = 'stage'
  const tr = document.createElement('div')
  tr.className = 'hud hud-tr'
  tr.getBoundingClientRect = () => ({ top, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) })
  stage.appendChild(tr)
  document.body.appendChild(stage)
}

describe('hudClearance', () => {
  it('is null with no lobby HUD bar (no lobby, or jsdom without layout)', () => {
    expect(hudClearance()).toBeNull()
    bar(0)
    expect(hudClearance()).toBeNull()
  })

  it('measures a bottom bar from the bottom edge', () => {
    bar(window.innerHeight - 94)
    expect(hudClearance()).toBe(94)
  })

  it('ignores the bar when it sits at the top (wide layouts)', () => {
    bar(12)
    expect(hudClearance()).toBeNull()
  })

  it('hands the CSS a custom property, or nothing so its fallback applies', () => {
    expect(clearanceStyle(null)).toBeUndefined()
    expect(clearanceStyle(130)).toEqual({ '--hud-clear': '130px' })
  })
})

describe('return.css: the bottom prompts on phones', () => {
  const css = readFileSync(join(__dirname, 'return.css'), 'utf8')
  const rule = (sel: string, from = 0) => {
    const i = css.indexOf(`${sel} {`, from)
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
  }

  it('the backup nudge is no longer pinned top-centre (over the tracker on phones)', () => {
    const base = rule('.backup-nudge')
    expect(base).not.toMatch(/left:\s*50%/)
    // Wide screens: clear of the left HUD column (Master card + tracker, <= 310 px).
    expect(base).toMatch(/max-width:\s*min\(440px,\s*calc\(100vw - 332px\)\)/)
  })

  it('on phones, the nudge and "Rest for now" sit above the measured HUD bar', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'))
    expect(css).toMatch(/\.rest-btn \{ bottom: calc\(var\(--hud-clear, 94px\) \+ 8px\); \}/)
    expect(phone).toMatch(/\.backup-nudge \{[^}]*bottom: calc\(var\(--hud-clear, 94px\) \+ 54px\)/)
  })
})
