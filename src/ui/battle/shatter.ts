/**
 * A boss's finisher shatter (lane I), pure: its sprite cut into triangles along a jittered
 * grid, each flying away from the body's heart with its own spin. Seeded by the unit, so a
 * replay breaks the same way every time. BossShatter.tsx draws the shards.
 */
import { hashString, seededRand } from '../pixel/rand'

export interface Shard {
  /** The triangle, as % of the sprite box (CSS clip-path). */
  clip: string
  /** Where it flies (stage px) and how far it turns (deg). */
  dx: number
  dy: number
  rot: number
  /** A small stagger (ms at 1×): the body breaks from its heart outward. */
  delay: number
}

export function shatterShards(w: number, h: number, seed: string, cols = 4, rows = 5): Shard[] {
  const r = seededRand(hashString(`shatter|${seed}`))
  // A grid of points (as %), the inner ones nudged so no two shards are alike.
  const pts: [number, number][][] = []
  for (let j = 0; j <= rows; j++) {
    const row: [number, number][] = []
    for (let i = 0; i <= cols; i++) {
      const inner = i > 0 && i < cols && j > 0 && j < rows
      const jx = inner ? (r.next() - 0.5) * (60 / cols) : 0
      const jy = inner ? (r.next() - 0.5) * (60 / rows) : 0
      row.push([(i / cols) * 100 + jx, (j / rows) * 100 + jy])
    }
    pts.push(row)
  }
  const out: Shard[] = []
  const cx = 50
  const cy = 55
  const f = (n: number) => `${Math.round(n * 10) / 10}%`
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = pts[j]![i]!
      const b = pts[j]![i + 1]!
      const c = pts[j + 1]![i + 1]!
      const d = pts[j + 1]![i]!
      // Split each cell along one diagonal or the other.
      const tris: [number, number][][] = (i + j) % 2 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]]
      for (const tri of tris) {
        const mx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3
        const my = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3
        const vx = mx - cx
        const vy = my - cy
        const len = Math.max(1, Math.hypot(vx, vy))
        const push = 30 + r.next() * 40
        out.push({
          clip: `polygon(${tri.map(([x, y]) => `${f(x)} ${f(y)}`).join(', ')})`,
          dx: Math.round((vx / len) * push * (w / 48)),
          dy: Math.round((vy / len) * push * (h / 64) - 10 - r.next() * 14),
          rot: Math.round((r.next() - 0.5) * 220),
          delay: Math.round((len / 70) * 160),
        })
      }
    }
  }
  return out
}
