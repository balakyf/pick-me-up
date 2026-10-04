/** Lane Q: the battle's foe-column widths as CSS variables (bigScreen.css picks one per tier). */
import { foeColumnPx, longestName } from './screen'

export function foeColumnVars(names: readonly string[]): Record<string, string> {
  const n = longestName(names)
  return {
    '--foe-col': `${foeColumnPx(n, 'desktop')}px`,
    '--foe-col-many': `${foeColumnPx(n, 'desktop', true)}px`,
    '--foe-col-wide': `${foeColumnPx(n, 'wide')}px`,
    '--foe-col-wide-many': `${foeColumnPx(n, 'wide', true)}px`,
  }
}
