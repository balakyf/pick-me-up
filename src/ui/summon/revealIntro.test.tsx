// @vitest-environment jsdom
/**
 * The Summon Theatre speaks each pull's de-duplicated lines (playtest 2026-10-13: two
 * quiet 2★s in one ten-pull both said "I watch, I listen, I hit when it counts."). The
 * picking lives in `introKeysForPull` (intro.test.ts); this checks the theatre uses it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import type { OwnedHero } from '../../engine/types'
import { introKey, introKeysForPull, personaOf } from './intro'
import { revealPlan } from './reveal'
import { RevealSequence } from './RevealSequence'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** The first seeded ten-pull in which two heroes would, on their own, speak the same line. */
function collidingPull(): OwnedHero[] {
  for (let seed = 1; seed <= 500; seed++) {
    const pull = summonMany(createAccount(seed), 'normal', 10).heroes
    const keys = revealPlan(pull, 1).cards.map((c) => introKey(c.hero, c.star))
    if (new Set(keys).size < keys.length) return pull
  }
  throw new Error('no seeded ten-pull with a repeated line')
}

describe('the theatre and the pull’s lines', () => {
  it('each person card shows the pull’s own line, so a ten-pull never repeats one', () => {
    const pull = collidingPull()
    const cards = revealPlan(pull, 1).cards
    const keys = introKeysForPull(cards)
    const expected = cards.map((c, i) => personaOf(c.hero, c.star, keys[i]).intro)
    // Without the pull's picks, this pull would have repeated a line.
    expect(cards.map((c) => personaOf(c.hero, c.star).intro)).not.toEqual(expected)

    let done = false
    act(() => root.render(<RevealSequence heroes={pull} masterLevel={1} onDone={() => (done = true)} />))
    const theatre = () => container.querySelector<HTMLElement>('.theatre')
    const shown: string[] = []
    act(() => theatre()!.click()) // end the ritual
    for (let guard = 0; theatre() && !done && guard < 40; guard++) {
      const intro = container.querySelector('.person-card .person-intro')
      if (intro) shown.push((intro.textContent ?? '').replace(/^“|”$/g, ''))
      act(() => theatre()!.click())
    }
    expect(shown).toEqual(expected)
  })
})
