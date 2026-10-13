/** Small, translated time phrases for the return layer ("10 hours", "in 3h 20m", "21:40"). */
import { t } from '../i18n/i18n'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** How long the Master was away, in a warm, rounded phrase ("3 days", "10 hours"). */
export function awayPhrase(realMs: number): string {
  if (realMs >= 2 * DAY) return t('{n} days', { n: Math.floor(realMs / DAY) })
  if (realMs >= DAY) return t('a day')
  if (realMs >= 2 * HOUR) return t('{n} hours', { n: Math.floor(realMs / HOUR) })
  if (realMs >= HOUR) return t('an hour')
  return t('a little while')
}

/** A countdown ("2d 4h", "3h 20m", "45m", "under a minute"). */
export function countdown(realMs: number): string {
  if (realMs <= 0) return t('ready now')
  if (realMs < MIN) return t('under a minute')
  const d = Math.floor(realMs / DAY)
  const h = Math.floor((realMs % DAY) / HOUR)
  const m = Math.floor((realMs % HOUR) / MIN)
  if (d > 0) return t('{d}d {h}h', { d, h })
  if (h > 0) return t('{h}h {m}m', { h, m })
  return t('{m}m', { m })
}

/** Local wall-clock time of a real epoch-ms ("21:40"). Presentation only. */
export function clockAt(realMs: number): string {
  const d = new Date(realMs)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
