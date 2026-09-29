import { useState } from 'react'
import type { GameState, HeroId, Line, OwnedHero, FloorResult } from '../engine/types'
import type { Store } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { HeroCard } from './HeroCard'
import { cpOf, Stars, Portrait } from './bits'
import { freshSeed } from './useGame'
import { heroFrameUrl } from './pixel/sprites'
import { cachedDataUrl } from './pixel/render'
import { drawProp } from './pixel/props'
import { scale } from './pixel/bitmap'
import type { Element, HeroClass, SkillProgress, Star } from '../engine/types'
import { SKILLS } from '../engine/content'

export const PARTY_LINES: Line[] = ['front', 'front', 'mid', 'back', 'back']
const SUMMON_COST = TUNING.gacha.normalCostGold
const PITY_AT = TUNING.gacha.normalPityFloor3At

function roster(state: GameState): OwnedHero[] {
  return Object.values(state.heroes) as OwnedHero[]
}

// ── Title ────────────────────────────────────────────────────────────────────
const PARADE: { heroClass: HeroClass | null; star: Star; element: Element }[] = [
  { heroClass: null, star: 1, element: 'earth' },
  { heroClass: 'warrior', star: 4, element: 'fire' },
  { heroClass: 'mage', star: 5, element: 'dark' },
  { heroClass: 'archer', star: 3, element: 'wind' },
  { heroClass: 'spearman', star: 4, element: 'water' },
  { heroClass: 'thief', star: 3, element: 'light' },
  { heroClass: null, star: 2, element: 'physical' },
]

export function TitleScreen({ store, hasSave }: { store: Store; hasSave: boolean }) {
  return (
    <div className="title-wrap">
      <div className="subtitle">Infinite Gacha</div>
      <div className="logo">
        Pick Me Up<span className="spark">!</span>
      </div>
      <div className="title-parade">
        {PARADE.map((p, i) => (
          <img
            key={i}
            className="px"
            src={heroFrameUrl({ id: `title_${i}`, name: `Parade ${i}`, ...p }, 'down', 0)}
            width={72}
            height={96}
            alt=""
          />
        ))}
      </div>
      <div className="tag">
        Summon unique heroes from the Mobius gacha, build a party of five, and climb the permadeath tower.
        Every hero is one of a kind. Every death is forever.
      </div>
      <div className="btns">
        {hasSave && (
          <button className="btn big" onClick={() => store.load()}>
            Continue
          </button>
        )}
        <button
          className="btn primary big"
          onClick={() => store.dispatch({ type: 'NEW_ACCOUNT', seed: freshSeed(), now: Date.now() })}
        >
          {hasSave ? 'New Game' : 'Begin'}
        </button>
      </div>
      {hasSave && <div className="muted" style={{ marginTop: 14 }}>Starting a new game overwrites your save.</div>}
    </div>
  )
}

// ── Summon ───────────────────────────────────────────────────────────────────
export function SummonScreen({ state, store }: { state: GameState; store: Store }) {
  const [revealed, setRevealed] = useState<OwnedHero | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const canAfford = state.gold >= SUMMON_COST

  function summonOne() {
    setErr(null)
    const prev = new Set(Object.keys(state.heroes))
    try {
      const next = store.dispatch({ type: 'SUMMON' })
      const newId = Object.keys(next.heroes).find((id) => !prev.has(id))
      if (newId) setRevealed(next.heroes[newId as HeroId]!)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Summon failed')
    }
  }

  return (
    <div className="screen">
      <h2>Mobius Summon</h2>
      <p className="sub">Normal pool · {SUMMON_COST.toLocaleString()} Gold per pull · every hero is unique, no duplicates.</p>

      <div className="summon-stage">
        {revealed ? (
          <div className="reveal">
            <HeroCard hero={revealed} showStats />
          </div>
        ) : (
          <div className="orb">
            <img className="px" src={cachedDataUrl('summon-orb', () => scale(drawProp('summonCrystal', 0).bmp, 5))} width={160} height={220} alt="The Mobius crystal" />
          </div>
        )}

        <div className="pity">
          Quality floor: <b>{state.gacha.pity}</b> / {PITY_AT} dry pulls → guaranteed ★★★
        </div>

        <button className="btn gold big" onClick={summonOne} disabled={!canAfford}>
          Summon · {SUMMON_COST.toLocaleString()} Gold
        </button>
        {!canAfford && <div className="muted">Not enough Gold — clear tower floors to earn more.</div>}
        {err && <div className="muted" style={{ color: 'var(--bad)' }}>{err}</div>}
      </div>
    </div>
  )
}

// ── Roster ───────────────────────────────────────────────────────────────────
export function RosterScreen({ state }: { state: GameState }) {
  const [sel, setSel] = useState<HeroId | null>(null)
  const heroes = roster(state).sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1
    return cpOf(b) - cpOf(a)
  })
  const living = heroes.filter((h) => h.alive).length

  return (
    <div className="screen">
      <h2>Roster</h2>
      <p className="sub">{heroes.length} {heroes.length === 1 ? 'hero' : 'heroes'} · {living} living · click a card for full stats.</p>
      <div className="grid cards">
        {heroes.map((h) => (
          <HeroCard
            key={h.id}
            hero={h}
            selected={sel === h.id}
            showStats={sel === h.id}
            onClick={() => setSel(sel === h.id ? null : h.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Party builder ─────────────────────────────────────────────────────────────
export function PartyScreen({ state, store }: { state: GameState; store: Store }) {
  const [draft, setDraft] = useState<(HeroId | null)[]>(() => [...state.party.slots])
  const [saved, setSaved] = useState(false)

  const living = roster(state).filter((h) => h.alive)
  const inParty = (id: HeroId) => draft.includes(id)

  function addHero(id: HeroId) {
    if (inParty(id)) return
    const i = draft.indexOf(null)
    if (i === -1) return
    const next = [...draft]
    next[i] = id
    setDraft(next)
    setSaved(false)
  }
  function clearSlot(i: number) {
    const next = [...draft]
    next[i] = null
    setDraft(next)
    setSaved(false)
  }
  function save() {
    store.dispatch({ type: 'SET_PARTY', slots: draft, lines: PARTY_LINES })
    setSaved(true)
  }

  const partyCP = draft.reduce((sum, id) => {
    const h = id ? state.heroes[id] : undefined
    return sum + (h && h.alive ? cpOf(h) : 0)
  }, 0)
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.party.slots)

  return (
    <div className="screen">
      <h2>Party</h2>
      <p className="sub">Up to five heroes. Slots 1–2 stand front, 3 mid, 4–5 back. Total CP {partyCP.toLocaleString()}.</p>

      <div className="party-slots">
        {draft.map((id, i) => {
          const h = id ? state.heroes[id] : undefined
          return (
            <div
              key={i}
              className={`slot ${h ? 'filled' : ''}`}
              onClick={() => h && clearSlot(i)}
              title={h ? 'Click to remove' : 'Empty'}
            >
              <span className="line-tag">{PARTY_LINES[i]}</span>
              {h ? (
                <div style={{ textAlign: 'center' }}>
                  <Portrait hero={h} />
                  <div className="hname" style={{ fontSize: 13 }}>{h.name}</div>
                  <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
                    <Stars star={h.star} />
                    <span className="cp"><span className="lab">CP </span>{cpOf(h)}</span>
                  </div>
                </div>
              ) : (
                <span>+ empty</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="row" style={{ margin: '8px 0 20px' }}>
        <button className="btn primary" onClick={save} disabled={!dirty}>
          {saved && !dirty ? '✓ Saved' : 'Save Party'}
        </button>
        <span className="muted">{draft.filter(Boolean).length}/5 deployed</span>
      </div>

      <h3 style={{ margin: '0 0 10px' }}>Available heroes</h3>
      <div className="grid cards">
        {living.map((h) => (
          <HeroCard key={h.id} hero={h} selected={inParty(h.id)} onClick={() => addHero(h.id)} />
        ))}
        {living.length === 0 && <div className="empty">No living heroes. Summon to recruit.</div>}
      </div>
    </div>
  )
}

// ── Results ──────────────────────────────────────────────────────────────────
/** One line of skill news for the results screen. */
export function skillProgressLine(p: SkillProgress, state: GameState): string {
  const who = state.heroes[p.heroId]?.name.split(/\s+/)[0] ?? 'A hero'
  const name = (id: string) => SKILLS[id]?.name ?? id
  return p.kind === 'level-up'
    ? `▲ ${who}'s ${name(p.skillId)} reached Lv ${p.level}`
    : `✦ ${who} fused ${name(p.from[0])} + ${name(p.from[1])} into ${name(p.skillId)}!`
}

export function ResultsScreen({
  result,
  state,
  onContinue,
}: {
  result: FloorResult
  state: GameState
  onContinue: () => void
}) {
  const win = result.cleared
  const failed = result.result.outcome === 'failed'
  const fallen = result.fallenHeroIds.map((id) => state.heroes[id]).filter(Boolean) as OwnedHero[]
  return (
    <div className="overlay">
      <div className="result-card">
        <div className={`big-outcome ${win ? 'win' : 'lose'}`}>{win ? 'FLOOR CLEARED' : failed ? 'MISSION FAILED' : 'DEFEATED'}</div>
        <div className="muted">
          Floor {result.floor}
          {result.firstClear && win ? ' · first clear bonus!' : ''}
          {failed ? ' · the escort fell — the floor must be retried' : ''}
        </div>

        <div className="reward-row">
          <div className="r">
            <div className="n" style={{ color: 'var(--gold)' }}>+{result.goldAwarded.toLocaleString()}</div>
            <div className="l">Gold</div>
          </div>
          <div className="r">
            <div className="n" style={{ color: 'var(--accent-2)' }}>+{result.xpAwarded}</div>
            <div className="l">XP each</div>
          </div>
        </div>

        {result.skillProgress.length > 0 && (
          <div className="skill-progress">
            {result.skillProgress.map((p, i) => (
              <div key={i} className={`sp-row ${p.kind}`}>{skillProgressLine(p, state)}</div>
            ))}
          </div>
        )}

        {fallen.length > 0 && (
          <div className="fallen">
            <div className="ft">☠ Permanently lost</div>
            {fallen.map((h) => (
              <div key={h.id}>
                {h.name} <span className="muted">({h.star}★ Lv{h.xp.level})</span>
              </div>
            ))}
          </div>
        )}

        <button className="btn primary big" onClick={onContinue} style={{ marginTop: 8 }}>
          {win ? 'Onward ▸' : 'Regroup'}
        </button>
      </div>
    </div>
  )
}
