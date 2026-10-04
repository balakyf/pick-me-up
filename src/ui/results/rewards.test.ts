import { describe, expect, it } from 'vitest'
import type { CombatLog, CombatUnitInit, FloorResult, TowerEvent } from '../../engine/types'
import { anchorHeadline, materialRarity, rareDropIndices, rewardDrops } from './rewards'
import { bannerNote, bannerWord, campView, continueLabel } from './resultsText'
import { saveErrorChange, storageFull } from '../qol/saveError'

const enemy = (id: string, templateId: string, targetTag?: string): CombatUnitInit => ({
  id,
  name: id,
  side: 'enemy',
  line: 'front',
  unitClass: null,
  element: 'dark',
  level: 10,
  maxHP: 100,
  maxSP: 0,
  cp: 1,
  templateId,
  ...(targetTag ? { targetTag } : {}),
})
const logOf = (units: CombatUnitInit[]): CombatLog => ({ seed: 1, floor: 10, encounterContext: 'tower', unitsInit: units, events: [], outcome: 'win', rngDraws: 0 })

describe('rewards', () => {
  it('rarity: the Book is legendary, an anchor’s authored drop rare, attribute stones uncommon', () => {
    expect(materialRarity('bookOfReverseHeaven')).toBe('legendary')
    expect(materialRarity('promotionStone')).toBe('common')
    expect(materialRarity('promotionStone', true)).toBe('rare')
    expect(materialRarity('attrStone_fire')).toBe('uncommon')
    expect(materialRarity('rankMaterial')).toBe('rare')
  })

  it('drops come rarest last, nothing empty; the rare ones chime', () => {
    const drops = rewardDrops({ floor: 20, firstClear: true, materialsAwarded: { bookOfReverseHeaven: 1, promotionStone: 3, attrStone_wind: 1, nothing: 0 } })
    expect(drops.map((d) => d.id)).toEqual(['promotionStone', 'attrStone_wind', 'bookOfReverseHeaven'])
    expect(rareDropIndices(drops)).toEqual([2])
    expect(rewardDrops({ floor: 3, firstClear: false, materialsAwarded: {} })).toEqual([])
  })

  it('an anchor’s headline names its mission target first (F10: the Black Priest, not the creature)', () => {
    const h = anchorHeadline(10, logOf([enemy('c', 'lv999_creature'), enemy('p', 'black_priest', 'black_priest'), enemy('g', 'goblin')]))
    expect(h).toEqual({ mission: 'Defense', boss: { name: 'The Black Priest', epithet: 'Shepherd of the Falling City', color: '#c8405a' } })
    expect(anchorHeadline(20, logOf([enemy('h', 'halgiraf', 'halgiraf')]))!.boss!.name).toBe('Halgiraf')
    // An anchor without a carded boss still has its mission.
    expect(anchorHeadline(5, logOf([enemy('g', 'goblin')]))).toEqual({ mission: 'Survival', boss: null })
    expect(anchorHeadline(7, logOf([]))).toBeNull()
  })
})

describe('results text', () => {
  const res = (cleared: boolean, outcome: string, event: TowerEvent | null = null) => ({ cleared, event, result: { outcome } }) as unknown as FloorResult
  it('the banner and its note', () => {
    expect(bannerWord(res(true, 'win'))).toBe('FLOOR CLEARED')
    expect(bannerWord(res(false, 'failed'))).toBe('MISSION FAILED')
    expect(bannerWord(res(false, 'retreat'))).toBe('RETREATED')
    expect(bannerWord(res(false, 'wipe'))).toBe('DEFEATED')
    expect(bannerNote(res(true, 'win'), 'bittersweet')).toMatch(/at a cost/)
    expect(bannerNote(res(true, 'win'), 'cleared')).toBeNull()
    expect(bannerNote(res(false, 'retreat'), 'retreat')).toMatch(/pulled them out/)
  })

  it('a recovery is a camp on the stair, and says what waits behind it', () => {
    const camp = campView({ kind: 'recovery', floor: 41, options: ['reinforcement', 'rest'] }, [{ kind: 'tournament', floor: 41, options: [] }])!
    expect(camp.kind).toBe('recovery')
    expect(camp.title).toBe('Camp on the stair')
    expect(camp.body).toContain('floor 41')
    expect(camp.then).toEqual(['The tournament will wait until the party has recovered.'])
    expect(campView({ kind: 'bonus', floor: 5, options: [] }, undefined)!.then).toEqual([])
    expect(campView(null, undefined)).toBeNull()
  })

  it('the button', () => {
    expect(continueLabel(res(true, 'win'))).toBe('Onward ▸')
    expect(continueLabel(res(false, 'wipe'))).toBe('Regroup')
    expect(continueLabel(res(false, 'wipe', { kind: 'recovery', floor: 3, options: [] }))).toBe('To the camp ▸')
  })
})

describe('the save-error notice', () => {
  it('raises once per run of failures and clears when a save succeeds', () => {
    const err = new Error('QuotaExceededError: storage is full')
    expect(saveErrorChange(false, err)).toBe('raise')
    expect(saveErrorChange(true, err)).toBeNull()
    expect(saveErrorChange(true, null)).toBe('clear')
    expect(saveErrorChange(false, null)).toBeNull()
  })
  it('tells a full storage from another refusal', () => {
    expect(storageFull(new Error('storage is full'))).toBe(true)
    const q = new Error('x')
    q.name = 'QuotaExceededError'
    expect(storageFull(q)).toBe(true)
    expect(storageFull(new Error('SecurityError: access denied'))).toBe(false)
  })
})
