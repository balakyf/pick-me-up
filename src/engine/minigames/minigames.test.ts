import { describe, it, expect } from 'vitest'
import { upgradeEquipment, upgradeOdds, upgradeCost, upgradeRefusal, ballistaWound, woundBoss, practice, nextEquipmentGrade } from './minigames'
import { createAccount } from '../account'
import { craftEquipment } from '../equipment'
import { playFloor, buildEncounter, deployReport } from '../tower'
import { TUNING } from '../tuning'
import type { EquipmentId, GameState, HeroId, OwnedHero } from '../types'

const M = TUNING.minigames

function smith(): GameState {
  const acct = createAccount(6)
  const s = { ...acct, gold: 1_000_000, meta: { ...acct.meta, masterLevel: 6 }, materials: { promotionStone: 500 } }
  return craftEquipment(s, 'weapon')
}
const itemId = (s: GameState) => s.inventory[0]!.id as EquipmentId

describe('Blacksmithing (equipment grade-up)', () => {
  it('odds follow the canon ladder and scale with performance', () => {
    expect(upgradeOdds('E', 0.5)).toBeCloseTo(0.9)
    expect(upgradeOdds('A', 0.5)).toBeCloseTo(0.25)
    expect(upgradeOdds('SS', 0.5)).toBeCloseTo(0.05)
    expect(upgradeOdds('C', 1)).toBeGreaterThan(upgradeOdds('C', 0))
    expect(upgradeOdds('E', 1)).toBeLessThanOrEqual(M.maxOdds)
    expect(nextEquipmentGrade('SSS')).toBeNull()
  })

  it('pays, rolls deterministically, and on success raises the grade and stats', () => {
    const s = smith()
    const before = s.inventory[0]!
    const cost = upgradeCost(before)!
    const a = upgradeEquipment(s, itemId(s), 1)
    const b = upgradeEquipment(s, itemId(s), 1)
    expect(a.success).toBe(b.success)
    expect(a.state.gold).toBe(s.gold - cost.gold)
    const after = a.state.inventory[0]!
    if (a.success) {
      expect(after.grade).toBe(nextEquipmentGrade(before.grade))
      expect(after.statBonus.pAtk!).toBeGreaterThan(before.statBonus.pAtk!)
    }
    expect(after.refines).toBe(1)
  })

  it('a failure keeps the item (only the materials are lost)', () => {
    let s = smith()
    let failed = false
    for (let i = 0; i < 40 && !failed; i++) {
      const grade = s.inventory[0]!.grade
      const r = upgradeEquipment(s, itemId(s), 0)
      if (!r.success) {
        failed = true
        expect(r.state.inventory[0]!.grade).toBe(grade)
        expect(r.state.inventory).toHaveLength(1)
      }
      s = r.state
    }
    expect(failed).toBe(true)
  })

  it('playing raises the skill; auto-resolve does not', () => {
    const s = smith()
    expect(upgradeEquipment(s, itemId(s), 0.7).state.meta.skill.blacksmith).toBeCloseTo(M.startSkill + M.skillPerPlay, 5)
    expect(upgradeEquipment(s, itemId(s)).state.meta.skill.blacksmith).toBe(M.startSkill)
    expect(practice({ ...s.meta, skill: { blacksmith: M.maxSkill, ballista: 0 } }, 'blacksmith').skill.blacksmith).toBe(M.maxSkill)
  })

  it('refuses without a Smithy, gold or stones', () => {
    const s = smith()
    expect(upgradeRefusal({ ...s, gold: 0 }, itemId(s))).toMatch(/gold/)
    expect(upgradeRefusal({ ...s, materials: {} }, itemId(s))).toMatch(/Stones/)
    expect(upgradeRefusal(s, 'eq_nope' as EquipmentId)).toMatch(/No such/)
  })
})

describe('Ballista', () => {
  it('wounds the boss by up to 30% of its HP', () => {
    expect(ballistaWound(1)).toBe(M.ballistaMaxWound)
    expect(ballistaWound(0)).toBe(0)
    const boss = buildEncounter(createAccount(1), 20).waves[1]!.units[0]!
    expect(woundBoss(boss, 1).currentHP).toBe(Math.round(boss.stats.maxHP * (1 - M.ballistaMaxWound)))
  })

  it('F20 plays it: a played ballista raises the Master’s skill', () => {
    const acct = createAccount(11)
    const id = Object.keys(acct.heroes)[0] as HeroId
    const s: GameState = {
      ...acct,
      tower: { ...acct.tower, currentFloor: 20, highestCleared: 19 },
      party: { ...acct.party, slots: [id, null, null, null, null] },
    }
    const played = playFloor(s, undefined, 1)
    expect(played.state.meta.skill.ballista).toBeCloseTo(M.startSkill + M.skillPerPlay, 5)
    expect(playFloor(s).state.meta.skill.ballista).toBe(M.startSkill)
  })
})

describe('tower integration', () => {
  it('a Wary, broken hero can refuse to deploy (known before Enter, recorded on the result)', () => {
    let refused = 0
    for (let seed = 1; seed <= 30; seed++) {
      const acct = createAccount(seed)
      const id = Object.keys(acct.heroes)[0] as HeroId
      const rebel = { ...acct.heroes[id]!, favor: 0, sanity: 5 } as OwnedHero
      // A friend in the second slot, so the floor still has someone to fight it.
      const friend = { ...rebel, id: 'h_friend' as HeroId, favor: 50, sanity: 100 }
      const s = { ...acct, heroes: { [id]: rebel, [friend.id]: friend }, party: { ...acct.party, slots: [id, friend.id, null, null, null] } }
      const report = deployReport(s)
      const result = playFloor(s).result
      const r = result.refusedHeroIds.includes(id)
      // The report the Enter sheet reads says exactly what the attempt does.
      expect(report[0]!.fit).toBe(!r)
      if (r) {
        refused++
        expect(report[0]!.reason).toBe('rebellion')
        expect(result.refusals).toContainEqual({ heroId: id, reason: 'rebellion' })
        // Alone, a rebel leaves nobody to fight: the attempt is refused outright.
        const alone = { ...s, heroes: { [id]: rebel }, party: { ...acct.party, slots: [id, null, null, null, null] } }
        expect(() => playFloor(alone)).toThrow(/no one is fit to fight/)
      }
    }
    expect(refused).toBeGreaterThan(0)
  })

  it('survivors of a clear warm to the Master; a blessing is spent', () => {
    const acct = createAccount(12)
    const id = Object.keys(acct.heroes)[0] as HeroId
    const s = { ...acct, heroes: { [id]: { ...acct.heroes[id]!, blessed: true } } }
    const { state, result } = playFloor(s)
    expect(result.cleared).toBe(true)
    expect(state.heroes[id]!.favor).toBe(TUNING.favor.start + TUNING.favor.perClear)
    expect(state.heroes[id]!.blessed).toBe(false)
  })
})
