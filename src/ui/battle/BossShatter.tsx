import { useMemo } from 'react'
import { shatterShards } from './shatter'
import './bossShow.css'

/**
 * The finisher's shatter (lane I): the fallen boss's own sprite breaks into shards that fly
 * apart and fade, in stage coordinates (inside `.battle-units`). Under reduced motion the
 * shards only fade where they are.
 */
export function BossShatter({
  src,
  x,
  y,
  w,
  h,
  seed,
  durMs,
  delayMs,
}: {
  src: string
  /** Feet position, as the unit stands. */
  x: number
  y: number
  w: number
  h: number
  seed: string
  /** The flight (real ms) and when it starts (the killing blow lands). */
  durMs: number
  delayMs: number
}) {
  const shards = useMemo(() => shatterShards(w, h, seed), [w, h, seed])
  return (
    <div className="boss-shatter" style={{ left: x - w / 2, top: y - h, width: w, height: h, zIndex: 997 }} aria-hidden="true">
      {shards.map((s, i) => (
        <div
          key={i}
          className="bs-shard"
          style={{
            backgroundImage: src ? `url(${src})` : undefined,
            backgroundSize: `${w}px ${h}px`,
            clipPath: s.clip,
            ['--dx' as string]: `${s.dx}px`,
            ['--dy' as string]: `${s.dy}px`,
            ['--rot' as string]: `${s.rot}deg`,
            ['--shard-dur' as string]: `${durMs}ms`,
            ['--shard-delay' as string]: `${delayMs + s.delay}ms`,
          }}
        />
      ))}
    </div>
  )
}
