/** Plain-text summary of a batch of simulation runs (grouped by profile). */
import { ACTS } from '../engine/content'
import type { SimResult } from './sim'

function median(xs: number[]): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}

export function summarize(results: SimResult[]): string {
  const lines: string[] = []
  const byProfile = new Map<string, SimResult[]>()
  for (const r of results) byProfile.set(r.profile, [...(byProfile.get(r.profile) ?? []), r])
  for (const [profile, runs] of byProfile) {
    lines.push(`\n## ${profile} (${runs.length} runs)`)
    const finals = runs.map((r) => r.days[r.days.length - 1]!)
    lines.push(`final floor: ${finals.map((f) => f.highestCleared).join(', ')} · dead: ${finals.map((f) => f.deaths).join(', ')} · alive: ${finals.map((f) => f.alive).join(', ')}`)
    lines.push(`gold: ${finals.map((f) => f.gold).join(', ')} · gems: ${finals.map((f) => f.gems).join(', ')} · ML: ${finals.map((f) => f.masterLevel).join(', ')} · spent $${finals.map((f) => f.spentUsd).join(', ')}`)
    lines.push(`invasions: ${runs.map((r) => r.invasions).join(', ')} · lost to captors: ${runs.map((r) => r.captiveLosses).join(', ')} · deleted: ${runs.filter((r) => r.deleted).length}`)
    lines.push('act            | median day to clear | deaths (median) | attempts (median)')
    for (const a of ACTS) {
      const day = median(runs.map((r) => r.firstClearDay[a.to]).filter((d): d is number => d !== undefined))
      const reached = runs.filter((r) => r.firstClearDay[a.to] !== undefined).length
      const deaths = median(runs.map((r) => sumRange(r.deaths, a.from, a.to)))
      const att = median(runs.map((r) => sumRange(r.attempts, a.from, a.to)))
      lines.push(`${a.title.split(' — ')[0]!.padEnd(14)} | ${Number.isNaN(day) ? '—' : `day ${day}`} (${reached}/${runs.length}) | ${deaths} | ${att}`)
    }
    const walls = new Map<number, number>()
    for (const r of runs) for (const [f, n] of Object.entries(r.attempts)) walls.set(Number(f), (walls.get(Number(f)) ?? 0) + n)
    const top = [...walls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    lines.push(`walls (total attempts): ${top.map(([f, n]) => `F${f}×${n}`).join(' ')}`)
    const ref: Record<string, number> = {}
    for (const r of runs) for (const [k, n] of Object.entries(r.refusals)) ref[k] = (ref[k] ?? 0) + n
    lines.push(`bot refusals: ${JSON.stringify(ref)}`)
  }
  return lines.join('\n')
}

function sumRange(m: Record<number, number>, from: number, to: number): number {
  let s = 0
  for (let f = from; f <= to; f++) s += m[f] ?? 0
  return s
}
