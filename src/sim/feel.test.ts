/**
 * The climb's FEEL (plan docs/superpowers/plans/2026-10-16-fun-tension-tuning.md; spec
 * 2026-10-12 §1 RC2/RC3, §3 S12, S13, S16, S19, S20): the first 25 floors are a sawtooth
 * of tension and release for the NAIVE player — the free tutorial pull, Suggest every
 * floor, always `doors[0]`, the first Boon, no summons, no promotions (src/sim/feel.ts) —
 * measured with the honest scout's bands and the real fights:
 *
 *   - Path: mostly Safe/Fair, a would-be death in at most 10% of fights;
 *   - the Breather after a boss: at least 90% Safe;
 *   - the Act I-II bosses: a real peak — a would-be death in 25-50% of first attempts over
 *     F5/F10/F15, and F5 and F10 each rarely Safe and never a death trap; the Decisive
 *     Moment's Protect halves the deaths at least;
 *   - the Skull: mostly Risky — at most 30% Safe, a would-be death in 30-60% of fights;
 *   - no death spiral: losses are routs, and at least 80% of the runs end with 5 or more
 *     living heroes.
 *
 * …and with no CLIFF for a TYPICAL player (`typical` in feel.ts: it also summons with spare
 * gold, takes the Skull when the scout calls it Safe or Fair, and takes the Decisive
 * Moment). Its stronger roster meets each boss's static curve where the naive player meets
 * the mercy cap, so a boss tuned only for the naive player can wall it — the first tension
 * pass put F20 at a 78-80% would-be death with Protect saving a third, and made F15's
 * escort a Deadly retry wall (reviewer probe, 2×40 other seeds). So:
 *
 *   - every boss F5-F25 is a peak for it, not a cliff: a would-be death in 20-60% of first
 *     attempts, F15's escort lost at most once every two runs;
 *   - the Decisive Moment saves most of them (Protect, then Pull back: ≥ 75% come home whole);
 *   - the Skulls the scout calls Safe or Fair cost nobody.
 *
 * Before the 2026-10-16 tension pass (at 1ba6103) every boss read Safe (and killed no one),
 * the Skull was 73% Safe and the Path 82%: a flat climb on which the Decisive Moment
 * almost never fired. 24 seeds × 3 variants, ~12 s.
 */
import { describe, it, expect } from 'vitest'
import { bossRows, feelReport, formatFeel, type FeelFight, type FeelReport, type KindRow } from './feel'

const SEEDS = 24
const naive = feelReport('naive', SEEDS)
const decisive = feelReport('decisive', SEEDS)
const typical = feelReport('typical', SEEDS)
const table = formatFeel(naive, decisive, typical)

const banded = (r: KindRow) => r.band.safe + r.band.fair + r.band.risky + r.band.deadly
const safe = (r: KindRow) => r.band.safe / banded(r)
const riskyOrWorse = (r: KindRow) => (r.band.risky + r.band.deadly) / banded(r)
const row = (x: FeelReport, k: keyof FeelReport['rows']) => x.rows[k]
const boss = (x: FeelReport, floor: number) => bossRows(x).find((b) => b.floor === floor)!
const committed = (x: FeelReport): FeelFight[] => x.runs.flatMap((r) => r.fights).filter((f) => !f.counterfactual)
const safeShareAt = (x: FeelReport, floor: number) => {
  const xs = committed(x).filter((f) => f.floor === floor && f.threat !== null)
  return xs.filter((f) => f.threat === 'safe').length / xs.length
}

describe(`the climb's feel: a naive player, F1-F25 (${SEEDS} seeds)`, () => {
  it('plays every kind of floor often enough to judge', () => {
    expect(row(naive, 'path').fights, table).toBeGreaterThan(SEEDS * 10)
    expect(row(naive, 'elite').fights, table).toBeGreaterThan(SEEDS * 8)
    expect(row(naive, 'boss').firsts, table).toBe(SEEDS * 3)
    expect(row(naive, 'breather').fights, table).toBeGreaterThanOrEqual(SEEDS * 3)
    expect(row(naive, 'f20').fights, table).toBeGreaterThanOrEqual(SEEDS * 0.8)
  })

  it('the tutorial floors stay as they were: Safe, and nobody dies', () => {
    const t = row(naive, 'tutorial')
    expect(t.fights).toBe(SEEDS * 2)
    expect(safe(t), table).toBe(1)
    expect(t.wouldDie, table).toBe(0)
  })

  it('Path: mostly Safe or Fair, a would-be death in at most 10% of fights', () => {
    const p = row(naive, 'path')
    expect(safe(p), table).toBeGreaterThanOrEqual(0.6)
    expect(safe(p), table).toBeLessThanOrEqual(0.85)
    expect((p.band.safe + p.band.fair) / banded(p), table).toBeGreaterThanOrEqual(0.8)
    expect(p.wouldDie, table).toBeLessThanOrEqual(0.1)
  })

  it('the Breather after a boss is a breath: at least 90% Safe', () => {
    expect(safe(row(naive, 'breather')), table).toBeGreaterThanOrEqual(0.9)
  })

  it('the early Bosses are a peak: a would-be death in 25-50% of first attempts; F5 and F10 rarely Safe, never a death trap', () => {
    const b = row(naive, 'boss')
    expect(b.wouldDieFirst, table).toBeGreaterThanOrEqual(0.25)
    expect(b.wouldDieFirst, table).toBeLessThanOrEqual(0.5)
    // F15 is an escort: its peak is the escort (asserted on the typical player below).
    for (const f of [5, 10]) {
      expect(safeShareAt(naive, f), `F${f}\n${table}`).toBeLessThanOrEqual(0.3)
      expect(boss(naive, f).wouldDieFirst, `F${f}\n${table}`).toBeGreaterThanOrEqual(0.25)
      expect(boss(naive, f).wouldDieFirst, `F${f}\n${table}`).toBeLessThanOrEqual(0.6)
    }
  })

  it('…and the Decisive Moment answers it: Protect at least halves the Boss deaths', () => {
    const b = row(decisive, 'boss')
    expect(b.wouldDie, table).toBeGreaterThan(0.2)
    expect(b.died, table).toBeLessThanOrEqual(b.wouldDie / 2)
    expect(b.deaths, table).toBeLessThanOrEqual(b.wouldDeaths / 2)
  })

  it('the Skull door pays more, so it hurts more: at most 30% Safe, a would-be death in 30-60%', () => {
    const e = row(naive, 'elite')
    expect(safe(e), table).toBeLessThanOrEqual(0.3)
    expect(riskyOrWorse(e), table).toBeGreaterThanOrEqual(0.4)
    expect(e.wouldDie, table).toBeGreaterThanOrEqual(0.3)
    expect(e.wouldDie, table).toBeLessThanOrEqual(0.6)
  })

  it('F20 (Halgiraf, the act gate) is a bump, never a wall, for the naive roster', () => {
    const g = row(naive, 'f20')
    expect(riskyOrWorse(g), table).toBeGreaterThan(0.1)
    expect(g.winRate, table).toBeGreaterThanOrEqual(0.9)
    expect(g.wouldDie, table).toBeLessThanOrEqual(0.5)
  })

  it('the scout stays honest on this climb: Safe never kills, Fair seldom does', () => {
    const fights = [...naive.runs, ...typical.runs].flatMap((r) => r.fights).filter((f) => f.threat !== null)
    const safeKills = fights.filter((f) => f.threat === 'safe' && f.wouldDie > 0)
    expect(safeKills.map((f) => `#${f.seed} F${f.floor} ${f.kind}`)).toEqual([])
    const fair = fights.filter((f) => f.threat === 'fair')
    expect(fair.filter((f) => f.wouldDie > 0).length / fair.length).toBeLessThanOrEqual(0.05)
  })

  it('no death spiral: losses are routs, and the roster survives the climb', () => {
    // A loss that costs 3+ heroes (several fall on one tick, before the line can break) is
    // rare in absolute terms; the share of losses is noisy because nearly every loss is a
    // Skull fought on the side (the counterfactual), so both are bounded.
    const all = naive.runs.flatMap((r) => r.fights)
    expect(naive.routShare, table).toBeGreaterThanOrEqual(0.85)
    expect(all.filter((f) => !f.keptWon && f.deaths > 2).length / all.length, table).toBeLessThanOrEqual(0.01)
    expect(naive.living5, table).toBeGreaterThanOrEqual(0.8)
    expect(naive.deathsPer10, table).toBeLessThanOrEqual(2)
    // Taking the Decisive Moment is worth it: far fewer deaths for the same climb.
    expect(decisive.deathsPer10, table).toBeLessThanOrEqual(naive.deathsPer10 / 2)
    expect(decisive.living5, table).toBeGreaterThanOrEqual(naive.living5)
  })
})

describe(`the climb's feel: a typical player has peaks, not cliffs, F1-F25 (${SEEDS} seeds)`, () => {
  it('climbs the whole way and takes the Skull the scout calls Safe or Fair', () => {
    expect(typical.finished, table).toBe(SEEDS)
    expect(row(typical, 'elite').fights, table).toBeGreaterThan(SEEDS * 3)
    const e = row(typical, 'elite')
    expect(e.band.risky + e.band.deadly, table).toBe(0)
    // The honest scout's Fair-or-better Skull costs nobody.
    expect(e.deaths, table).toBeLessThanOrEqual(0.02)
  })

  it('every boss is a peak, not a cliff: a would-be death in 20-60% of first attempts (F15: the escort is seldom lost)', () => {
    for (const f of [5, 10, 20, 25]) {
      expect(boss(typical, f).wouldDieFirst, `F${f}\n${table}`).toBeGreaterThanOrEqual(0.2)
      expect(boss(typical, f).wouldDieFirst, `F${f}\n${table}`).toBeLessThanOrEqual(0.6)
    }
    expect(boss(typical, 15).wouldDieFirst, table).toBeLessThanOrEqual(0.6)
    expect(boss(typical, 15).lossesPerRun, table).toBeLessThanOrEqual(0.5)
    for (const f of [20, 25]) expect(boss(typical, f).lossesPerRun, `F${f}\n${table}`).toBeLessThanOrEqual(0.25)
  })

  it('the Decisive Moment fires on the bosses and saves most of them (Protect, then Pull back)', () => {
    const doomed = committed(typical).filter((f) => f.wouldDie > 0 && [5, 10, 15, 20, 25].includes(f.floor))
    expect(doomed.length, table).toBeGreaterThanOrEqual(SEEDS)
    expect(doomed.filter((f) => f.deaths === 0).length / doomed.length, table).toBeGreaterThanOrEqual(0.75)
  })

  it('the Path stays mostly Safe and the roster whole', () => {
    expect(row(typical, 'path').wouldDie, table).toBeLessThanOrEqual(0.1)
    expect(typical.living5, table).toBe(1)
  })
})
