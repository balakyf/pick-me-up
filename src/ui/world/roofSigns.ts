/**
 * Name signs on the roofs: each building's emblem and name on a wooden plaque, so the
 * estate reads at a glance from any zoom. Drawn straight onto the world canvas in
 * logical pixels, sized against the current zoom so the sign keeps a steady size on
 * screen (large when zoomed out, never a smudge).
 */
import { TILE } from './lobbyMap'
import { BUILDING_ICON, type Building, type RoomId, type Zone, type ZoneId } from './lobbyMap'
import { ROOF_LIFT } from '../pixel/campusProps'
import { t } from '../i18n/i18n'

export type SignState = 'built' | 'site' | 'building'

/** Screen pixels the sign's name aims for, whatever the zoom. */
const NAME_PX = 12
const ICON_PX = 16

/** A building's sign, centred on the front slope of its roof. */
export function drawBuildingSign(ctx: CanvasRenderingContext2D, b: Building, x: number, y: number, zoom: number, state: SignState): void {
  const w = b.rect.w * TILE
  const body = (b.rect.h - 1) * TILE + ROOF_LIFT
  const ridge = Math.round(body * 0.36)
  drawSign(ctx, x + w / 2, y + ridge + (body - ridge) * 0.5, w - 4, t(b.label), BUILDING_ICON[b.id], zoom, state)
}

/** The open-air places (yard, market, garden, memorial, the daily rift) and their emblems. */
export const ZONE_SIGN: Partial<Record<ZoneId, { label: string; icon: string; room: RoomId | null }>> = {
  yard: { label: 'Training Yard', icon: '🎯', room: 'training' },
  market: { label: 'Market', icon: '🪙', room: 'market' },
  garden: { label: 'Garden', icon: '🌱', room: 'garden' },
  memorial: { label: 'Memorial', icon: '🕯️', room: 'memorial' },
  daily: { label: 'Daily Dungeon', icon: '🌀', room: null },
}

/** An open-air place's sign, a plaque standing at the top of its ground. */
export function drawZoneSign(ctx: CanvasRenderingContext2D, zone: Zone, camX: number, camY: number, zoom: number, state: SignState): void {
  const info = ZONE_SIGN[zone.id]
  if (!info) return
  const w = zone.rect.w * TILE
  drawSign(ctx, zone.rect.x * TILE + w / 2 - camX, zone.rect.y * TILE + TILE * 1.4 - camY, w - 4, t(info.label), info.icon, zoom, state)
}

function drawSign(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxW: number,
  label: string,
  icon: string,
  zoom: number,
  state: SignState,
): void {
  const k = 1 / Math.max(0.5, zoom)
  const namePx = Math.max(7, NAME_PX * k)
  const iconPx = Math.max(10, ICON_PX * k)
  const sub = state === 'site' ? t('not built yet') : state === 'building' ? t('under construction') : ''
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${namePx}px 'Pixelify Sans', 'Courier New', monospace`
  const nameW = ctx.measureText(label).width
  ctx.font = `${namePx * 0.8}px 'Pixelify Sans', 'Courier New', monospace`
  const subW = sub ? ctx.measureText(sub).width : 0
  const pad = 4 * k
  const lineGap = 2 * k
  const boxW = Math.min(maxW, Math.max(nameW, subW, iconPx) + pad * 2)
  const boxH = iconPx + lineGap + namePx + (sub ? lineGap + namePx * 0.8 : 0) + pad * 2
  const bx = Math.round(cx - boxW / 2)
  const by = Math.round(cy - boxH / 2)
  // The plaque: dark wood, a gold (or grey, for a lot) rim, a drop shadow.
  const lw = Math.max(1, Math.round(k))
  ctx.fillStyle = 'rgba(12, 8, 20, 0.45)'
  ctx.fillRect(bx + lw, by + lw * 2, boxW, boxH)
  ctx.fillStyle = state === 'built' ? 'rgba(46, 28, 18, 0.92)' : 'rgba(28, 24, 36, 0.88)'
  ctx.fillRect(bx, by, boxW, boxH)
  ctx.strokeStyle = state === 'built' ? '#e0b64a' : '#8a84a0'
  ctx.lineWidth = lw
  ctx.strokeRect(bx + lw / 2, by + lw / 2, boxW - lw, boxH - lw)
  // Emblem, name, and (for a lot) its status.
  let ly = by + pad + iconPx / 2
  ctx.font = `${iconPx}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`
  ctx.globalAlpha *= state === 'built' ? 1 : 0.7
  ctx.fillText(state === 'built' ? icon : '🔨', cx, ly)
  ctx.globalAlpha /= state === 'built' ? 1 : 0.7
  ly += iconPx / 2 + lineGap + namePx / 2
  ctx.font = `600 ${namePx}px 'Pixelify Sans', 'Courier New', monospace`
  ctx.fillStyle = state === 'built' ? '#f6e6b8' : '#c8c2d8'
  ctx.fillText(label, cx, ly, boxW - pad)
  if (sub) {
    ly += namePx / 2 + lineGap + (namePx * 0.8) / 2
    ctx.font = `${namePx * 0.8}px 'Pixelify Sans', 'Courier New', monospace`
    ctx.fillStyle = '#9a94b0'
    ctx.fillText(sub, cx, ly, boxW - pad)
  }
  ctx.restore()
}
