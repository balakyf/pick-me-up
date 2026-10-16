// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { fmt, setLocale, t } from './i18n'
import { SortieBar } from '../tower/SortieBar'
import type { Sortie } from '../../engine/types'

/**
 * Numbers read in the game's language, not the browser's (playtest 2026-10-13: the
 * French screens showed "27,120" and "0.5").
 */
afterEach(() => setLocale('en'))

const NNBSP = ' '

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('locale-aware numbers', () => {
  it('fmt groups and marks decimals the way the active locale writes them', () => {
    setLocale('en')
    expect(fmt(27120)).toBe('27,120')
    expect(fmt(0.5)).toBe('0.5')
    setLocale('fr')
    expect(fmt(27120)).toBe(`27${NNBSP}120`)
    expect(fmt(0.5)).toBe('0,5')
    expect(fmt(1234567)).toBe(`1${NNBSP}234${NNBSP}567`)
  })

  it('t() writes a fractional placeholder with a French decimal comma, and leaves whole numbers alone', () => {
    setLocale('fr')
    expect(t('Skull door: ×{m} gold.', { m: 1.5 })).toContain('×1,5')
    expect(t('Floor {n}', { n: 1200 })).toBe('Étage 1200')
    setLocale('en')
    expect(t('Skull door: ×{m} gold.', { m: 1.5 })).toContain('×1.5')
  })

  it('the sortie purse reads "27 120" in French', () => {
    const sortie = { floors: 3, purse: 27120, boons: [] } as unknown as Sortie
    setLocale('fr')
    const fr = renderToStaticMarkup(<SortieBar sortie={sortie} onReturn={() => {}} />)
    expect(fr).toContain(`27${NNBSP}120`)
    expect(fr).not.toContain('27,120')
    setLocale('en')
    expect(renderToStaticMarkup(<SortieBar sortie={sortie} onReturn={() => {}} />)).toContain('27,120')
  })

  it('no screen formats numbers with toLocaleString() (it follows the browser, not the game)', () => {
    const offenders = walk('src/ui').filter((f) => /\.toLocaleString\(/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('no screen writes a decimal with toFixed() (always a "." mark), except the simulated US-dollar prices', () => {
    const offenders = walk('src/ui').flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${f}:${i + 1}` }))
        .filter(({ line }) => /\.toFixed\(/.test(line) && !/usd/i.test(line))
        .map(({ at }) => at),
    )
    expect(offenders).toEqual([])
    setLocale('fr')
    expect(fmt(0.85, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe('0,85')
  })

  it('French speed is "RAP.", never "VIT" (the vitality growth grade)', () => {
    setLocale('fr')
    expect(t('SPD')).toBe('RAP.')
    expect(t('+{pct}% {stat}', { pct: 10, stat: t('SPD') })).not.toMatch(/VIT/)
  })
})
