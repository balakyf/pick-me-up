/** CLI: `npx vite-node src/sim/feelRun.ts [seeds]` — print the climb's feel tables
 *  (naive, Decisive and typical players, F1-F25; see feel.ts). */
import { feelReport, formatFeel } from './feel'

const seeds = Number(process.argv[2] ?? 24)
const t0 = performance.now()
const naive = feelReport('naive', seeds)
const decisive = feelReport('decisive', seeds)
const typical = feelReport('typical', seeds)
console.log(formatFeel(naive, decisive, typical))
console.log(`\n(${Math.round(performance.now() - t0)} ms)`)
