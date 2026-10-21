/**
 * Impact sparks (spec 2026-10-12, S8; WP2): a burst of 1-2 px squares in the blow's
 * element colour, about 6 per hit and 14 per crit. Offsets are seeded by hashString of
 * the event's seq, never Math.random, so they replay identically. The stage is scaled
 * by CSS, so plain divs stay crisp; the burst is capped so the DOM stays small.
 */
import { hashString } from '../pixel/rand'

export interface Spark {
  key: string
  /** Flight in stage px. */
  dx: number
  dy: number
  size: 1 | 2
  /** Animation delay, ms. */
  delay: number
  color: string
}

/** Never more than this many spark nodes on stage at once. */
export const MAX_SPARKS = 40
export const SPARKS_PER_HIT = 6
export const SPARKS_PER_CRIT = 14
export const SPARKS_PER_DEATH = 16

/** How many sparks a moment throws. */
export function sparkCount(kind: 'hit' | 'crit' | 'death'): number {
  return kind === 'crit' ? SPARKS_PER_CRIT : kind === 'death' ? SPARKS_PER_DEATH : SPARKS_PER_HIT
}

/**
 * A deterministic burst: `count` sparks for event `seq`, flying out in a fan (biased
 * upward), 6-20 stage px. Capped at MAX_SPARKS.
 */
export function sparkSpecs(seq: number, count: number, color: string, accent?: string): Spark[] {
  const n = Math.max(0, Math.min(MAX_SPARKS, Math.floor(count)))
  const out: Spark[] = []
  for (let i = 0; i < n; i++) {
    const h = hashString(`${seq}+${i}`)
    const angle = ((i + ((h & 0xff) / 255) * 0.8) / Math.max(1, n)) * Math.PI * 2
    const dist = 6 + ((h >>> 8) & 0xff) / 18 // 6 .. ~20
    out.push({
      key: `${seq}-${i}`,
      dx: Math.round(Math.cos(angle) * dist),
      dy: Math.round(Math.sin(angle) * dist * 0.8 - 4),
      size: (h >>> 16) % 3 === 0 ? 2 : 1,
      delay: ((h >>> 20) % 4) * 15,
      color: accent && i % 3 === 0 ? accent : color,
    })
  }
  return out
}

/** One burst, centred on (x, y) in stage coordinates. */
export function Sparks({ x, y, sparks }: { x: number; y: number; sparks: readonly Spark[] }) {
  return (
    <div className="sparks" style={{ left: x, top: y }} aria-hidden="true">
      {sparks.map((s) => (
        <span
          key={s.key}
          className={`bspark s${s.size}`}
          style={{
            background: s.color,
            animationDelay: `${s.delay}ms`,
            ['--dx' as string]: `${s.dx}px`,
            ['--dy' as string]: `${s.dy}px`,
          }}
        />
      ))}
    </div>
  )
}
