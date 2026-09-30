// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { backupMilestone, daysSinceExport, lastExportAt, lastNudgedFloor, markExported, markNudged, saveFileName } from './saveBackup'

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => window.localStorage.clear())

describe('save backup bookkeeping', () => {
  it('remembers the last export and milestone (and reads "never" when unset)', () => {
    expect(lastExportAt()).toBeNull()
    expect(lastNudgedFloor()).toBe(0)
    markExported(1234)
    markNudged(20)
    expect(lastExportAt()).toBe(1234)
    expect(lastNudgedFloor()).toBe(20)
  })

  it('counts whole days since the export', () => {
    expect(daysSinceExport(null, 5)).toBeNull()
    expect(daysSinceExport(0, DAY - 1)).toBe(0)
    expect(daysSinceExport(0, 3 * DAY + 5)).toBe(3)
    expect(daysSinceExport(10, 0)).toBe(0) // a clock that went backwards reads "today"
  })

  it('reminds once per ten floors, unless the last export is fresh', () => {
    expect(backupMilestone(9, 0, null, 0)).toBeNull()
    expect(backupMilestone(10, 0, null, 0)).toBe(10)
    expect(backupMilestone(17, 10, null, 0)).toBeNull() // already reminded at 10
    expect(backupMilestone(23, 10, null, 0)).toBe(20)
    expect(backupMilestone(23, 10, 5 * DAY, 5 * DAY + 60_000)).toBeNull() // exported a minute ago
    expect(backupMilestone(23, 10, 0, 2 * DAY)).toBe(20)
  })

  it('names the file after the account and the day', () => {
    const at = new Date(2026, 8, 30, 15, 0).getTime()
    expect(saveFileName('local', at)).toBe('pick-me-up-local-2026-09-30.json')
    expect(saveFileName('Ma Save/../x', at)).toBe('pick-me-up-Ma-Save-x-2026-09-30.json')
    expect(saveFileName('', at)).toBe('pick-me-up-save-2026-09-30.json')
  })
})
