/**
 * Where the lobby's canvas overlays may go: speech bubbles stay on screen and out from
 * under the HTML HUD (the clock, the Daily/Advice bar, First Steps), and rain, snow and
 * fog stay outdoors — they never fall inside a building whose roof is open. Pure.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Place a bubble or a label (its natural rect) inside a VW×VH view: keep it on screen
 * sideways, and move it off any HUD box it would sit under — below a box in the top half
 * of the view, above one in the bottom half. `moved` says whether it left its natural
 * place (a bubble then drops its tail).
 */
export function placeBubble(r: Rect, obstacles: readonly Rect[], VW: number, VH: number): Rect & { moved: boolean } {
  const x = Math.min(Math.max(1, r.x), Math.max(1, VW - r.w - 1))
  let y = Math.min(Math.max(1, r.y), Math.max(1, VH - r.h - 1))
  for (let i = 0; i < 4; i++) {
    const under = obstacles.find((o) => hits({ x, y, w: r.w, h: r.h }, o))
    if (!under) break
    y = under.y + under.h / 2 < VH / 2 ? under.y + under.h + 2 : under.y - r.h - 2
  }
  y = Math.min(Math.max(1, y), Math.max(1, VH - r.h - 1))
  return { x, y, w: r.w, h: r.h, moved: x !== r.x || y !== r.y }
}

/** A DOM box (screen px) in the canvas's logical px, given the canvas's own screen box. */
export function toCanvasRect(box: { left: number; top: number; width: number; height: number }, canvas: { left: number; top: number; width: number; height: number }, VW: number, VH: number): Rect {
  const kx = VW / Math.max(1, canvas.width)
  const ky = VH / Math.max(1, canvas.height)
  return { x: (box.left - canvas.left) * kx, y: (box.top - canvas.top) * ky, w: box.width * kx, h: box.height * ky }
}

/**
 * The screen rects where weather must not fall: every building whose roof is open (the
 * Master is inside, or the roof is fading away), walls and the lifted back wall included.
 */
export function shelterRects(
  buildings: readonly { id: string; rect: { x: number; y: number; w: number; h: number } }[],
  roofAlpha: (id: string) => number,
  tile: number,
  roofLift: number,
  camX: number,
  camY: number,
): Rect[] {
  return buildings
    .filter((b) => roofAlpha(b.id) < 0.5)
    .map((b) => ({ x: b.rect.x * tile - camX, y: b.rect.y * tile - roofLift - camY, w: b.rect.w * tile, h: b.rect.h * tile + roofLift }))
}
