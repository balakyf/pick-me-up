/**
 * CLI: `npx vite-node src/sim/combatMetrics.ts [days] [seeds] [fromFloor] [out.json]`
 * (defaults 30 days × 3 seeds from F41 — the same bots and seeds as `npm run sim -- 30 3`).
 *
 * The combat-feel gate (lane D, "combat brain"): plays the same bots as `npm run sim`
 * and reads back every tower floor attempt they make. For the fights from `fromFloor`
 * (default F41) it prints:
 *
 *   - AoE share     — the party's effective damage dealt by all-enemies skills (< 55 %)
 *   - rounds        — median party actions per hero (≥ 3)
 *   - enemies act   — share of fights in which an enemy took an action (> 80 %)
 *   - deaths/attempt — heroes lost per floor attempt (no worse than before)
 *   - replay        — median estimated replay length at 1× (~15–60 s)
 *
 * and (lane F) a roles table: heals, shields, taunts and foe statuses per fight, the
 * healing share (damage taken healed back or soaked) and the share of fights with a role.
 *
 * The gate reads every attempt from `fromFloor` — a retreat included (the 'fought out' row
 * leaves those out). Below: per profile, per band, and a few diagnostics (overkill,
 * hits wasted on immunity, hits on a weakness). Lane D's before/after is in
 * docs/superpowers/specs/2026-10-02-lane-d.md.
 */
import { writeFileSync } from 'node:fs'
import { simulate, PROFILES, type ProfileId } from './sim'
import { fightStats, summarizeFights, type FightStats, type FightSummary } from './fightStats'

const args = process.argv.slice(2).filter((a) => a !== '--')
const days = Number(args[0] ?? 30)
const seeds = Number(args[1] ?? 3)
const fromFloor = Number(args[2] ?? 41)
const out = args[3]

interface Tagged extends FightStats {
  profile: ProfileId
  seed: number
  /** Heroes lost on the attempt as the floor result counts them. */
  fallen: number
}

const fights: Tagged[] = []
const finals: Record<string, number[]> = {}
for (const id of Object.keys(PROFILES) as ProfileId[]) {
  for (let i = 0; i < seeds; i++) {
    const seed = 1000 + i * 7919
    const r = simulate(id, seed, days, (_before, result) => {
      fights.push({ ...fightStats(result.result.log), profile: id, seed, fallen: result.fallenHeroIds.length })
    })
    ;(finals[id] ??= []).push(r.days[r.days.length - 1]!.highestCleared)
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const row = (label: string, s: FightSummary) =>
  `${label.padEnd(16)} | ${String(s.fights).padStart(5)} | ${pct(s.aoeShare).padStart(6)} | ${s.medianRounds.toFixed(2).padStart(6)} | ${pct(s.enemiesActShare).padStart(6)} | ${s.deathsPerAttempt.toFixed(3).padStart(6)} | ${s.medianReplayS.toFixed(1).padStart(5)}s (${s.p10ReplayS.toFixed(0)}–${s.p90ReplayS.toFixed(0)}) | ${pct(s.winShare).padStart(6)} | ${pct(s.overkillShare).padStart(6)} | ${s.immunePerFight.toFixed(2).padStart(5)} | ${pct(s.weakShare).padStart(6)}`

const summarize = (fs: Tagged[]) => summarizeFights(fs, (f) => (f as Tagged).fallen)
const lines: string[] = []
lines.push(`combat metrics · ${days} days × ${seeds} seeds · finals ${Object.entries(finals).map(([p, f]) => `${p} ${f.join('/')}`).join(' · ')}`)
lines.push(`${'fights'.padEnd(16)} |     n |    AoE | rounds | en.act | dth/at | replay 1× (p10–p90) |    win |  overk | immun |   weak`)
const late = fights.filter((f) => f.floor >= fromFloor)
lines.push(row(`all F${fromFloor}+`, summarize(late)))
lines.push(row('  fought out', summarize(late.filter((f) => f.outcome !== 'retreat'))))
for (const id of Object.keys(PROFILES) as ProfileId[]) lines.push(row(`  ${id}`, summarize(late.filter((f) => f.profile === id))))
const bands: [number, number][] = [[1, 20], [21, 40], [41, 60], [61, 79], [80, 100]]
for (const [a, b] of bands) lines.push(row(`F${a}–${b}`, summarize(fights.filter((f) => f.floor >= a && f.floor <= b))))
lines.push(row('every fight', summarize(fights)))

const s = summarize(late)
const gate = [
  ['AoE share < 55%', s.aoeShare < 0.55],
  ['median rounds >= 3', s.medianRounds >= 3],
  ['enemies act > 80%', s.enemiesActShare > 0.8],
  ['median replay 15–60 s', s.medianReplayS >= 15 && s.medianReplayS <= 60],
] as const
lines.push(`gate (F${fromFloor}+): ${gate.map(([k, ok]) => `${ok ? 'PASS' : 'FAIL'} ${k}`).join(' · ')}`)
// Roles (lane F): how often the party heals, shields and taunts, and what it saves.
const roleRow = (label: string, r: FightSummary) =>
  `${label.padEnd(16)} | heals ${r.healsPerFight.toFixed(2).padStart(5)} | shields ${r.shieldsPerFight.toFixed(2).padStart(5)} | taunts ${r.tauntsPerFight.toFixed(2).padStart(5)} | foe statuses ${r.foeStatusesPerFight.toFixed(2).padStart(5)} | healing share ${pct(r.healingShare).padStart(6)} | fights with a role ${pct(r.roleFightShare).padStart(6)}`
lines.push('roles (per fight)')
lines.push(roleRow(`all F${fromFloor}+`, s))
for (const [a, b] of bands) lines.push(roleRow(`F${a}–${b}`, summarize(fights.filter((f) => f.floor >= a && f.floor <= b))))
console.log(lines.join('\n'))
if (out) writeFileSync(out, JSON.stringify({ days, seeds, fromFloor, finals, fights }))
