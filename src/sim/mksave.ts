/**
 * CLI: `npm run mksave -- [profile] [days] [seed] [out.json]` — let a playtest bot play
 * an account for `days` real days ending now, and write it as a save file (the same
 * envelope as Menu → Export save). Paste it into Import, or put it in localStorage
 * under `pmu.save.v1`, to playtest the mid or late game.
 */
import { writeFileSync } from 'node:fs'
import { playAccount, PROFILES, type ProfileId } from './sim'
import { saveState } from '../engine/account'

const profile = (process.argv[2] ?? 'engaged') as ProfileId
if (!(profile in PROFILES)) throw new Error(`unknown profile ${profile}: ${Object.keys(PROFILES).join(', ')}`)
const days = Number(process.argv[3] ?? 10)
const seed = Number(process.argv[4] ?? 1000)
const out = process.argv[5] ?? `save-${profile}-${days}d.json`
const DAY = 24 * 3_600_000
// Start at midnight `days` days ago so the last session lands earlier today.
const today = new Date()
today.setHours(0, 0, 0, 0)
const epoch = today.getTime() - days * DAY
const state = playAccount(profile, seed, days, epoch)
writeFileSync(out, saveState(state, Date.now()))
console.error(`${out}: ${profile} after ${days} days — F${state.tower.highestCleared}, ${Object.values(state.heroes).filter((h) => h.alive).length} heroes, ${state.gold.toLocaleString()} gold`)
