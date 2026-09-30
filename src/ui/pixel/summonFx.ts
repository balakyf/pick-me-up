/**
 * The Mobius summoning circle (pure pixels): concentric rings with rune ticks, tinted
 * by the rarity the ritual is about to reveal. Rotation/scale are CSS; the art is code.
 */
import { createBitmap, hex, outline, set, type Bitmap } from './bitmap'
import { INK } from './palette'

function ring(b: Bitmap, cx: number, cy: number, r: number, c: number, dotted = false): void {
  const steps = Math.max(24, Math.round(r * 7))
  for (let i = 0; i < steps; i++) {
    if (dotted && i % 3 === 0) continue
    const t = (i / steps) * Math.PI * 2
    set(b, cx + Math.round(r * Math.cos(t)), cy + Math.round(r * 0.5 * Math.sin(t)), c)
  }
}

/** A 96×56 flattened (perspective) summoning circle in `tint`. */
export function drawSummonCircle(tint: string): Bitmap {
  const b = createBitmap(96, 56)
  const c = hex(tint)
  const pale = hex('#fff6e0')
  ring(b, 48, 28, 44, c)
  ring(b, 48, 28, 38, pale, true)
  ring(b, 48, 28, 26, c)
  ring(b, 48, 28, 12, pale)
  // rune ticks between the outer rings
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2
    const x = 48 + Math.round(41 * Math.cos(t))
    const y = 28 + Math.round(20.5 * Math.sin(t))
    set(b, x, y, pale)
    set(b, x + 1, y, c)
  }
  // the Mobius ∞ at the centre
  for (let i = 0; i < 20; i++) {
    const t = (i / 20) * Math.PI * 2
    set(b, 48 + Math.round(8 * Math.sin(t)), 28 + Math.round(3 * Math.sin(2 * t)), c)
  }
  return outline(b, INK)
}
