/**
 * Save backup bookkeeping (UI side): when the Master last exported, the export's file
 * name, and the gentle floor-milestone reminder. The timestamps live in localStorage
 * (per browser, like the save itself); every access is guarded, so a blocked storage
 * just means "never exported" and no nagging.
 */

const LAST_EXPORT_KEY = 'pmu.lastExport'
const NUDGED_KEY = 'pmu.backupNudgeFloor'
const DAY_MS = 24 * 60 * 60 * 1000

/** Remind every this many floors cleared… */
export const NUDGE_EVERY_FLOORS = 10
/** …unless an export happened within this long. */
export const NUDGE_FRESH_MS = DAY_MS

function read(key: string): number | null {
  try {
    const v = window.localStorage.getItem(key)
    const n = v === null ? NaN : Number(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}
function write(key: string, n: number): void {
  try {
    window.localStorage.setItem(key, String(n))
  } catch {
    /* storage unavailable — the reminder simply can't remember */
  }
}

export const lastExportAt = (): number | null => read(LAST_EXPORT_KEY)
export const markExported = (now: number): void => write(LAST_EXPORT_KEY, now)
export const lastNudgedFloor = (): number => read(NUDGED_KEY) ?? 0
export const markNudged = (floor: number): void => write(NUDGED_KEY, floor)

/** Whole days since the last export (null = never). Pure. */
export function daysSinceExport(last: number | null, now: number): number | null {
  if (last === null) return null
  return Math.max(0, Math.floor((now - last) / DAY_MS))
}

/**
 * The floor milestone worth a "back up your save?" reminder, or null. Pure: the
 * newest multiple of NUDGE_EVERY_FLOORS cleared, if it's past the last one we
 * reminded about and the last export isn't fresh.
 */
export function backupMilestone(highestCleared: number, lastNudged: number, lastExport: number | null, now: number): number | null {
  const milestone = Math.floor(highestCleared / NUDGE_EVERY_FLOORS) * NUDGE_EVERY_FLOORS
  if (milestone < NUDGE_EVERY_FLOORS || milestone <= lastNudged) return null
  if (lastExport !== null && now - lastExport < NUDGE_FRESH_MS) return null
  return milestone
}

/** `pick-me-up-<accountId>-<YYYY-MM-DD>.json`, safe for every file system. Pure. */
export function saveFileName(accountId: string, now: number): string {
  const id = accountId.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'save'
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `pick-me-up-${id}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}
