/**
 * The one-time elements hint: the first time a blow lands on a weakness, the scene
 * explains the wheel once (UI-side: a localStorage flag, never the save). Pure helpers;
 * storage access is wrapped so a private window or blocked storage just shows nothing new.
 */
import type { Element } from '../../engine/types'
import { ELEMENT_ADVANTAGE, TUNING } from '../../engine/tuning'
import { ELEMENT_VIS } from '../bits'
import { t } from '../i18n/i18n'

export const ELEMENTS_HINT_KEY = 'pmu.hint.elements'

/** Whether the player has already dismissed the hint. */
export function elementsHintSeen(storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(ELEMENTS_HINT_KEY) === '1'
  } catch {
    return false
  }
}

/** Remember that the hint was read. */
export function markElementsHintSeen(storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(ELEMENTS_HINT_KEY, '1')
  } catch {
    /* storage refused: the hint may show again next time */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

const label = (e: Element) => `${ELEMENT_VIS[e].glyph} ${t(ELEMENT_VIS[e].label)}`

/**
 * The wheel as chains of "beats": Fire › Wind › Earth › Water › Fire, and Light ⇄ Dark,
 * read from the engine's own table so it can never drift from the rules.
 */
export function elementChains(): string[] {
  const adv = ELEMENT_ADVANTAGE
  const seen = new Set<Element>()
  const out: string[] = []
  for (const start of Object.keys(adv) as Element[]) {
    if (seen.has(start)) continue
    const chain: Element[] = [start]
    seen.add(start)
    let cur = adv[start]
    while (cur !== undefined && !seen.has(cur)) {
      chain.push(cur)
      seen.add(cur)
      cur = adv[cur]
    }
    if (chain.length === 2 && adv[chain[1]!] === start) out.push(`${label(chain[0]!)} ⇄ ${label(chain[1]!)}`)
    else out.push([...chain, ...(cur === start ? [start] : [])].map(label).join(' › '))
  }
  return out
}

/** The multipliers the hint quotes (×1.5 / ×0.75 today). */
export function elementMultipliers(): { weak: string; resist: string } {
  const fmt = (x: number) => `×${String(Math.round(x * 100) / 100)}`
  return { weak: fmt(TUNING.combat.elementAdvantage), resist: fmt(TUNING.combat.elementDisadvantage) }
}
