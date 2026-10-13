// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { defaultLegacyState } from '../../engine/life'
import type { GameState, HeroId } from '../../engine/types'
import { DecisiveMoment } from '../battle/DecisiveMoment'
import type { Decisive } from '../battle/decisive'
import { baneName, enemyName } from '../legacy/legacyText'
import { LegacySlot } from '../legacy/LegacySlot'
import { ResultsScreen } from '../ResultsScreen'
import { chronicleLine } from '../life/speech'
import { explainFloor } from '../tower/explain'
import { fixtureLog, fixtureResult } from '../tower/fixtures'
import { FR } from './fr'
import { inSentence, setLocale, t } from './i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * French grammar for Bane and enemy names (review finding #18). "Le Fléau de Mira" is a
 * heading; in a sentence it is "le Fléau de Mira" (and "du Fléau…" after "de"). Enemy
 * names carry no article in French ("Gobelin"), so no FR template may drop one in where
 * the English key wrote "the {enemy}".
 */

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
  setLocale('en')
})

const MIRA = { heroName: 'Mira' }

function withBane(): GameState {
  const base = createAccount(3)
  return {
    ...base,
    life: {
      ...base.life,
      legacy: {
        ...defaultLegacyState(),
        nemeses: [
          {
            id: 'nem_1',
            templateId: 'goblin',
            name: 'Goblin',
            element: 'fire',
            level: 7,
            heroId: 'h_x' as HeroId,
            heroName: 'Mira',
            diedFloor: 3,
            revengeFloor: 6,
            status: 'waiting',
          },
        ],
      },
    },
  }
}

describe('inSentence', () => {
  it('lowers a leading article, and nothing else', () => {
    setLocale('fr')
    expect(baneName(MIRA)).toBe('Le Fléau de Mira')
    expect(inSentence(baneName(MIRA))).toBe('le Fléau de Mira')
    expect(inSentence(t('A Bane'))).toBe('un Fléau')
    expect(inSentence('L’Œuf')).toBe('l’Œuf')
    expect(inSentence('Gobelin')).toBe('Gobelin')
    expect(inSentence('Leon')).toBe('Leon')
    setLocale('en')
    expect(inSentence(t('A Bane'))).toBe('a Bane')
    expect(inSentence('Mira’s Bane')).toBe('Mira’s Bane')
    expect(inSentence('Annie')).toBe('Annie')
  })

  it('French "de" and "à" contract with a mid-sentence "le"/"les" and elide before a vowel', () => {
    setLocale('fr')
    expect(t('Echo of {name}', { name: inSentence(baneName(MIRA)) })).toBe('Écho du Fléau de Mira')
    expect(t('Pass the echo to {name}', { name: inSentence(baneName(MIRA)) })).toBe('Transmettre l’écho au Fléau de Mira')
    expect(t('Echo of {name}', { name: inSentence(t('A Bane')) })).toBe('Écho d’un Fléau')
    expect(t('Pass the echo to {name}', { name: 'Ilan' })).toBe('Transmettre l’écho à Ilan')
    // A capitalised heading form is never contracted (only `inSentence` output is).
    expect(t('Echo of {name}', { name: 'Le Fléau de Mira' })).toBe('Écho de Le Fléau de Mira')
  })
})

describe('French Bane and enemy names mid-sentence', () => {
  it('the results screen, the Decisive card and the Because… lines say "le Fléau de Mira"', () => {
    setLocale('fr')
    expect(t('Revenge on {bane}: +{n} gold', { bane: inSentence(baneName(MIRA)), n: '1,200' })).toBe('Vengeance sur le Fléau de Mira : +1,200 or')
    // A heading-position Bane keeps its capital.
    expect(t('{bane} waits on floor {n}', { bane: baneName(MIRA), n: 6 })).toBe('Le Fléau de Mira attend à l’étage 6')

    // The real Results screen's revenge line (the call site, not just the template).
    const log = fixtureLog([{ tick: 1, kind: 'battle-start', heroIds: ['h_a'], enemyIds: ['e_1'] }])
    act(() => root.render(<ResultsScreen result={fixtureResult(log, { nemesisDefeated: ['nem_1'] })} state={withBane()} onContinue={() => {}} instant />))
    expect(container.textContent).toMatch(/Vengeance sur le Fléau de Mira : \+[\d  ,.]+ or/)
    expect(container.textContent).not.toContain('sur Le Fléau')
  })

  it('the Decisive card focuses "le Fléau de Mira"', () => {
    setLocale('fr')
    act(() =>
      root.render(
        <DecisiveMoment
          decisive={{ kind: 'death' } as Decisive}
          heroName="Ilan"
          killerName={enemyName('Mira\'s Bane')}
          heroBust=""
          iselBust=""
          ordersLeft={1}
          tutorial={false}
          onChoose={() => {}}
        />,
      ),
    )
    expect(container.textContent).toContain('Focaliser le Fléau de Mira')
    expect(container.textContent).not.toContain('Le Fléau')
  })

  it('the Because… lines use the same verb as the Focus button, and the right article', () => {
    setLocale('fr')
    const log = fixtureLog([
      { tick: 1, kind: 'battle-start', heroIds: ['h_a', 'h_b'], enemyIds: ['e_1', 'e_2'] },
      { tick: 3, kind: 'act', actorId: 'h_b', skillId: 'basic-attack', targetId: 'e_2' },
      { tick: 3, kind: 'hit', actorId: 'h_b', targetId: 'e_2', amount: 60, crit: true, hpAfter: 0 },
      { tick: 3, kind: 'death', unitId: 'e_2' },
    ])
    const revenant = { ...log, unitsInit: log.unitsInit.map((u) => (u.id === 'e_2' ? { ...u, name: "Mira's Bane" } : u)) }
    const [focus] = explainFloor(fixtureResult(revenant), [{ tick: 3, kind: 'focus', enemyId: 'e_2' }])
    expect(focus!.text).toBe('Focaliser (le Fléau de Mira) : la cible est tombée avant de pouvoir agir à nouveau.')
    expect(t('Focus')).toBe('Focaliser')
    for (const k of Object.keys(FR).filter((k) => k.startsWith('Focus: '))) expect(FR[k]).toMatch(/^Focaliser /)

    const r = explainFloor(fixtureResult(log, { nemesisDefeated: ['nem_1'] }), [], withBane())
    expect(r.map((x) => x.text)).toContain('Vengeance : le Fléau de Mira est tombé, et Mira est vengé.')
  })

  it('the chronicle names the avenged killer with an article', () => {
    setLocale('fr')
    const s = withBane()
    const ilan = Object.keys(s.heroes)[0] as HeroId
    const line = chronicleLine(s, { at: 0, kind: 'revenge', heroIds: [ilan], detail: 'nem_1' })
    expect(line).toMatch(/ a abattu l’ennemi qui avait tué Mira \(Gobelin\)\. Mira est vengé\.$/)
    // An old entry carries the Bane's English name: it is translated, and mid-sentence.
    const old = chronicleLine(s, { at: 0, kind: 'revenge', heroIds: [ilan], detail: "Mira's Bane" })
    expect(old).toMatch(/ a abattu le Fléau de Mira\. Les morts sont vengés\.$/)
  })

  it('the Memorial plaque and the Legacy slot keep enemy names grammatical', () => {
    setLocale('fr')
    expect(t('struck down by the {enemy} (Lv{level})', { enemy: t('Goblin'), level: 3 })).toBe('tombé face à l’ennemi « Gobelin » (Niv.3)')
    const base = withBane()
    const dead = Object.keys(base.heroes)[0] as HeroId
    const nem = { ...base.life.legacy.nemeses[0]!, heroId: dead }
    const s: GameState = {
      ...base,
      heroes: { ...base.heroes, [dead]: { ...base.heroes[dead]!, alive: false } },
      life: { ...base.life, legacy: { ...base.life.legacy, nemeses: [nem] } },
    }
    const log = fixtureLog([{ tick: 1, kind: 'battle-start', heroIds: ['h_a'], enemyIds: ['e_1'] }])
    act(() => root.render(<LegacySlot state={s} result={fixtureResult(log, { floor: 3, cleared: false, fallenHeroIds: [dead] })} />))
    expect(container.textContent).toContain('L’ennemi qui a abattu Mira (Gobelin) est désormais marqué : le Fléau de Mira. Il attend à l’étage 6.')
  })

  it('no French template puts an article-less enemy name where English wrote "the {enemy}"', () => {
    // French enemy names carry no article ("Gobelin"): "{enemy}" may open a sentence or a
    // label, sit in parentheses or quotes, but never follow a word ("a abattu {enemy}").
    const bad = Object.entries(FR).filter(([, v]) => /\p{Ll}[  ]\{enemy\}/u.test(v))
    expect(bad).toEqual([])
  })
})
