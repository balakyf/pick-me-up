/**
 * CLI: `npm run sim -- [days] [seeds] [out.json]` — run every profile and print a
 * summary (floor reached by day, deaths per act, walls, economy).
 */
import { writeFileSync } from 'node:fs'
import { simulate, PROFILES, type ProfileId, type SimResult } from './sim'
import { summarize } from './report'

const days = Number(process.argv[2] ?? 60)
const seeds = Number(process.argv[3] ?? 3)
const out = process.argv[4]
const results: SimResult[] = []
for (const id of Object.keys(PROFILES) as ProfileId[]) {
  for (let i = 0; i < seeds; i++) {
    const t0 = performance.now()
    const r = simulate(id, 1000 + i * 7919, days)
    results.push(r)
    const last = r.days[r.days.length - 1]!
    console.error(`${id} seed#${i}: F${last.highestCleared} by day ${last.day}, ${last.deaths} dead (${Math.round(performance.now() - t0)} ms)`)
  }
}
console.log(summarize(results))
if (out) writeFileSync(out, JSON.stringify(results))
