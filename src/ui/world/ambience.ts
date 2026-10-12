/**
 * Lobby ambience (WP8 fills it, spec 2026-10-12 V9): a time-of-day tint by the real
 * local hour, fireflies at night, drifting leaves (≤ 40 particles). Cosmetic only — it
 * reads no game state and must no-op wherever there is no real canvas (jsdom).
 *
 * WP0 stub: draws nothing.
 */

/** The camera rectangle in world pixels (unzoomed), as the lobby draw loop sees it. */
export interface AmbienceView {
  camX: number
  camY: number
  /** Viewport width/height in world pixels. */
  w: number
  h: number
}

export interface AmbienceFrame {
  /** Wall-clock ms (Date.now()) — the real local hour drives the tint. */
  nowReal: number
  view: AmbienceView
  /** The integer CSS zoom the canvas is shown at. */
  zoom: number
}

/** Called once per lobby frame, after the day/night lights and before the vignette. */
export function drawAmbience(ctx: CanvasRenderingContext2D, frame: AmbienceFrame): void {
  void ctx
  void frame
}
