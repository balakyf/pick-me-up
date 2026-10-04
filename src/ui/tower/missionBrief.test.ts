/**
 * Lane P · the filler floor's briefing: what wins and what loses, for every mission kind, the
 * act's story line, the vault's title — and nothing on an anchor (lane M's card is there).
 */
import { describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { buildEncounter } from '../../engine/tower'
import type { GameState, Mission } from '../../engine/types'
import { FILLER_STORY } from '../../engine/content/story'
import { MISSION_TAGS } from '../../engine/content/missions'
import { failLines, fillerBrief, missionKindOf, missionName } from './missionBrief'

const onFloor = (floor: number, seed = 11): GameState => {
  const acct = createAccount(seed, { now: 0 })
  return { ...acct, tower: { ...acct.tower, currentFloor: floor, highestCleared: floor - 1 } }
}
const names = { escort: 'Refugee', marked_leader: 'the marked Goblin', cache_bearer: 'Merman' }
const m = (objectives: Mission['objectives'], timer: number | null = null): Mission => ({ type: 'x', objectives, timer })

describe('the fail lines', () => {
  it('say what loses each mission', () => {
    expect(failLines(m([{ kind: 'annihilate' }]), 1, names)).toEqual(['The whole party falls.'])
    expect(failLines(m([{ kind: 'annihilate' }]), 2, names)).toEqual(['The whole party falls before the last wave does.'])
    expect(failLines(m([{ kind: 'survive', ticks: 600 }], 600), 1, names)).toEqual(['The whole party falls before the bell.'])
    expect(failLines(m([{ kind: 'reach', distance: 40 }]), 1, names)).toEqual(['The whole party falls before it gets out.'])
    expect(failLines(m([{ kind: 'defend', waves: 2 }]), 2, names)[0]).toMatch(/line breaks/)
    expect(failLines(m([{ kind: 'defeat', targetTag: 'marked_leader' }]), 1, names)).toEqual(['The whole party falls before the marked Goblin does.'])
    expect(failLines(m([{ kind: 'acquire', targetTag: 'cache_bearer' }]), 1, names)).toEqual(['The whole party falls before the prize is taken.'])
    // An escort: its fall loses the floor at once, and so does the party's.
    expect(failLines(m([{ kind: 'reach', distance: 32 }, { kind: 'protect', targetTag: 'escort' }]), 1, names)).toEqual([
      'Refugee falls: the mission fails at once.',
      'The whole party falls before it gets out.',
    ])
    // A clock that is not a survival's.
    expect(failLines(m([{ kind: 'defeat', targetTag: 'x' }], 420), 1, {})).toContain('420 ticks pass first.')
  })
})

describe('the filler briefing', () => {
  it('is null on an anchor, and reads the mission, its act’s line and both columns on a filler floor', () => {
    expect(fillerBrief(onFloor(10), 10, buildEncounter(onFloor(10), 10), {})).toBeNull()
    const s = onFloor(12)
    const b = fillerBrief(s, 12, buildEncounter(s, 12), names)!
    expect(b.kind).toBe('escort')
    expect(b.mission).toBe('Escort')
    expect(b.why).toMatch(/refugee/i)
    expect(b.objectives.some((l) => l.includes('Refugee'))).toBe(true)
    expect(b.fails[0]).toBe('Refugee falls: the mission fails at once.')
    expect(FILLER_STORY.ruins!.lines).toContain(b.flavour)
    expect(b.title.length).toBeGreaterThan(0)
  })

  it('names the F47 vault, and uses the act’s mission line elsewhere', () => {
    const v = onFloor(47)
    expect(fillerBrief(v, 47, buildEncounter(v, 47), {})!.title).toBe('The Vault of Al Ragna')
    for (let seed = 1; seed <= 10; seed++) {
      const s = onFloor(48, seed)
      const enc = buildEncounter(s, 48)
      const b = fillerBrief(s, 48, enc, {})!
      expect(b.why).toBe(FILLER_STORY.order!.missions[missionKindOf(enc.mission.type)!])
    }
  })

  it('names the mission’s people', () => {
    expect(missionName(MISSION_TAGS.leader, 'Goblin')).toBe('the marked Goblin')
    expect(missionName(MISSION_TAGS.vault, 'Dark Knight')).toBe('the vault’s keeper, Dark Knight')
    expect(missionName('priasis', 'Princess Priasis')).toBe('Princess Priasis')
    expect(missionKindOf('Hunt')).toBe('hunt')
    expect(missionKindOf('Delivery')).toBeNull()
  })
})
