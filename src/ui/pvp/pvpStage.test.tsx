// @vitest-environment jsdom
/**
 * Lane Q: PvP on stage in the DOM — the rival's title card then the battle, the raid sheet
 * (the shared picker, the dispatch with the team), the captive board, the invasion alarm,
 * the Memorial's legends and the job seats' picker.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { createAccount } from '../../engine/account'
import { reduce, type Store } from '../../engine/store'
import { raidRival, raidTargets, worldWeek } from '../../engine/pvp'
import { toWorldTime } from '../../engine/time'
import type { Command, GameState, HeroId, OwnedHero } from '../../engine/types'
import { PvpStageHost } from './PvpStageHost'
import { RaidSheet } from './RaidSheet'
import { CaptiveBoard } from './CaptiveBoard'
import { InvasionAlarm } from './InvasionAlarm'
import { playOnStage, resetStage, useStage } from './stageBus'
import { MemorialPanel, StaffSection } from '../life/lifePanels'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null
function render(node: JSX.Element): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(node))
  return host
}
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  act(() => resetStage())
  try {
    localStorage.clear()
  } catch {
    /* jsdom */
  }
})

function fakeStore(s0: GameState): Store & { sent: Command[] } {
  let cur = s0
  const sent: Command[] = []
  return {
    sent,
    getState: () => cur,
    dispatch: (cmd: Command) => {
      sent.push(cmd)
      cur = reduce(cur, cmd, toWorldTime(Date.now()))
      return cur
    },
    subscribe: () => () => undefined,
    getSaveError: () => null,
  } as unknown as Store & { sent: Command[] }
}

function account(): { s: GameState; ids: HeroId[] } {
  const acct = createAccount(41)
  const base = Object.values(acct.heroes)[0]!
  const heroes: Record<string, OwnedHero> = {}
  const ids: HeroId[] = []
  for (let i = 0; i < 6; i++) {
    const id = `h_s${i}` as HeroId
    ids.push(id)
    heroes[id] = {
      ...base,
      id,
      name: `Stager ${['Ana', 'Bo', 'Cy', 'Di', 'Ed', 'Fi'][i]}`,
      star: 5,
      xp: { level: 60, xpIntoLevel: 0, heldXp: 0, atCap: false },
      baseAttrs: { str: 60, agi: 60, vit: 60, int: 60, wil: 60 },
      growthGrades: { str: 8, agi: 8, vit: 8, int: 8, wil: 8 },
    }
  }
  const now = toWorldTime(Date.now())
  return {
    ids,
    s: {
      ...acct,
      gold: 100_000,
      gems: 1_000,
      heroes,
      party: { ...acct.party, slots: [ids[0]!, ids[1]!, null, null, null] },
      meta: { ...acct.meta, crackOpen: true, pi: 300, lastSeenAtWorld: now },
      tower: { ...acct.tower, highestCleared: 45, currentFloor: 46 },
      pvp: { ...acct.pvp, lastInvasionDay: Math.floor(now / 86_400_000) },
    },
  }
}

function StageWatch() {
  const req = useStage()
  return <div data-testid="stage">{req ? `${req.card?.kind ?? 'none'}|${req.logs.length}` : 'idle'}</div>
}

describe('PvP on stage', () => {
  it('plays the rival’s title card, then the battle (non-lethal), then calls back', () => {
    const { s } = account()
    const t = raidTargets(s, worldWeek(toWorldTime(Date.now())))[0]!
    const out = raidRival(s, t.id, toWorldTime(Date.now()))
    let done = 0
    const el = render(<PvpStageHost state={s} />)
    act(() =>
      playOnStage({
        card: { kind: 'raid', name: 'Wolf_42', guildId: 'kaiser', guildName: 'Kaiser', whale: true, floor: 44, rating: 1100, line: 'Their storeroom is guarded. Nobody dies in a raid.' },
        logs: [out.outcome.log],
        banner: { win: 'RAID WON', lose: 'DRIVEN BACK' },
        onDone: () => done++,
      }),
    )
    const card = el.querySelector('.pvp-card-overlay')!
    expect(card.getAttribute('role')).toBe('dialog')
    expect(card.textContent).toContain('Wolf_42')
    expect(card.textContent).toContain('WHALE')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(el.querySelector('.pvp-card-overlay')).toBeNull()
    expect(el.querySelector('.battle.trial')).not.toBeNull()
    expect(done).toBe(0)
  })

  it('the raid sheet takes its team from the shared picker and dispatches it', () => {
    const { s, ids } = account()
    const store = fakeStore(s)
    const rival = raidTargets(s, worldWeek(toWorldTime(Date.now())))[0]!
    let closed = 0
    const el = render(
      <>
        <RaidSheet state={s} store={store} rival={rival} onClose={() => closed++} />
        <StageWatch />
      </>,
    )
    expect(el.textContent).toContain(rival.name)
    expect(el.textContent).toContain('The team · 2/5')
    expect(el.querySelector('.hp-list')).not.toBeNull() // lane N's picker
    // add a third hero from the picker
    const row = [...el.querySelectorAll('.hp-row')].find((r) => r.textContent?.includes('Cy'))!
    act(() => (row.querySelector('.hp-pick') as HTMLButtonElement).click())
    expect(el.textContent).toContain('The team · 3/5')
    const go = el.querySelector('.raid-sheet .pbtn.danger') as HTMLButtonElement
    act(() => go.click())
    expect(store.sent.at(-1)).toEqual({ type: 'RAID_RIVAL', rivalId: rival.id, heroIds: [ids[0], ids[1], ids[2]] })
    expect(closed).toBe(1)
    expect(el.querySelector('[data-testid=stage]')!.textContent).toBe('raid|1')
  })

  it('the captive board shows who is held, by whom, the price and the clock; ransom dispatches', () => {
    const { s, ids } = account()
    const now = toWorldTime(Date.now())
    const held: GameState = {
      ...s,
      heroes: { ...s.heroes, [ids[3]!]: { ...s.heroes[ids[3]!]!, captiveOf: { master: 'Nox_9', rivalId: 'r5_3', ransomGold: 9000, ransomGems: 50, deadlineWorld: now + 5 * 3_600_000 } } },
      pvp: { ...s.pvp, captives: [{ id: 'cap_1', name: 'Knight of Iris_2', star: 5, level: 70, element: 'dark', growthGrades: { str: 9, agi: 9, vit: 9, int: 9, wil: 9 }, fromMaster: 'Iris_2', ransomGold: 1000, ransomGems: 10 }] },
    }
    const store = fakeStore(held)
    const sent: Command[] = []
    const el = render(<CaptiveBoard state={held} store={store} run={(c) => (sent.push(c), true)} />)
    const card = el.querySelector('.cb-card.held')!
    expect(card.classList.contains('urgent')).toBe(true)
    expect(card.textContent).toContain('held by Nox_9')
    expect(card.textContent).toContain('9,000')
    expect(card.textContent).toContain('synthesized in 5 world-h')
    act(() => (card.querySelector('.pbtn') as HTMLButtonElement).click())
    expect(sent).toEqual([{ type: 'RANSOM_HERO', heroId: ids[3] }])
    expect(el.querySelector('.cb-card.taken')!.textContent).toContain('Knight of Iris_2')
    expect(el.querySelectorAll('.cb-chain li')).toHaveLength(5)
  })

  it('the lobby raises an alarm for an unseen invasion; Later puts it away for good', () => {
    const { s } = account()
    const replay = { seed: 1, floor: 40, heroes: [], foes: [] }
    const raided: GameState = { ...s, pvp: { ...s.pvp, log: [{ worldDay: 5, direction: 'in', rival: 'Hex_77', won: false, goldDelta: -500, note: 'raided you and looted the storeroom', rivalId: 'r5_7', guildId: 'unity', replay }] } }
    const el = render(<InvasionAlarm state={raided} />)
    expect(el.querySelector('.invasion-alarm')!.textContent).toContain('Hex_77')
    expect(el.textContent).toContain('Your lobby was raided')
    const later = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Later')!
    act(() => later.click())
    expect(el.querySelector('.invasion-alarm')).toBeNull()
  })
})

describe('the small leftovers', () => {
  it('the Memorial shows the legends of earlier worlds', () => {
    const { s } = account()
    const legend = {
      heroId: 'h_old' as HeroId,
      name: 'Aster Vale',
      star: 6 as const,
      level: 88,
      heroClass: 'mage' as const,
      element: 'light' as const,
      portraitToken: '#aa66cc',
      cause: 'battle' as const,
      floor: 84,
      day: 3,
      daysServed: 20,
      bestFloor: 84,
      mourners: [],
      cycle: 0,
      statue: true,
    }
    const el = render(<MemorialPanel state={{ ...s, endgame: { cycle: 1, history: [], legends: [legend] } }} />)
    const shelf = el.querySelector('.legends-shelf')!
    expect(shelf.textContent).toContain('Aster Vale')
    expect(shelf.textContent).toContain('World 1')
    expect(shelf.querySelector('.legend.statue')).not.toBeNull()
    act(() => root?.unmount())
    root = null
    const none = render(<MemorialPanel state={s} />)
    expect(none.querySelector('.legends-shelf')).toBeNull()
  })

  it('a job seat is filled from the shared picker, not a native dropdown', () => {
    const { s } = account()
    const built = { ...s, facilities: { ...s.facilities, kitchen: { ...s.facilities.kitchen, level: 2 } } }
    const store = fakeStore(built)
    const el = render(<StaffSection state={built} store={store} job="cook" />)
    expect(el.querySelector('.staff select')).toBeNull()
    const fold = el.querySelector('details.staff-assign') as HTMLDetailsElement
    expect(fold).not.toBeNull()
    act(() => {
      fold.open = true
      fold.dispatchEvent(new Event('toggle'))
    })
    const pick = el.querySelector('.hp-pick') as HTMLButtonElement
    expect(pick).not.toBeNull()
    act(() => pick.click())
    expect(store.sent[0]).toMatchObject({ type: 'ASSIGN_JOB', job: 'cook' })
  })
})
