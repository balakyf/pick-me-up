import { useEffect, useState } from 'react'
import { sfx } from './audio/sound'
import { drawSummonCircle } from './pixel/summonFx'
import { shownStar } from '../engine/shop'
import type { GameState, HeroId, Line, OwnedHero, FloorResult } from '../engine/types'
import type { Store } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { HeroCard } from './HeroCard'
import { HeroBond } from './metaPanels'
import { cpOf, Stars, Portrait, STAR_COLOR } from './bits'
import { freshSeed } from './useGame'
import { heroFrameUrl } from './pixel/sprites'
import { cachedDataUrl } from './pixel/render'
import { drawProp } from './pixel/props'
import { scale } from './pixel/bitmap'
import type { Element, HeroClass, SkillProgress, Star, SummonPool } from '../engine/types'
import { HIDDEN_OBJECTIVES, SKILLS } from '../engine/content'

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
const ADV = TUNING.gacha.advanced

/** The summoning ritual: the circle wakes, a pillar of light in the (shown) rarity's colour, a flash. */
function SummonRitual({ heroes, masterLevel, onDone }: { heroes: OwnedHero[]; masterLevel: number; onDone: () => void }) {
  const best = Math.max(...heroes.map((h) => shownStar(h, masterLevel))) as Star
  const tint = STAR_COLOR[best]
  useEffect(() => {
    sfx('summon')
    const reveal = setTimeout(() => sfx(best >= 5 ? 'legend' : best >= 4 ? 'rare' : 'levelup'), 1100)
    const done = setTimeout(onDone, 1900)
    return () => {
      clearTimeout(reveal)
      clearTimeout(done)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const circle = cachedDataUrl(`circle|${tint}`, () => scale(drawSummonCircle(tint), 3))
  return (
    <div className="ritual" onClick={onDone} style={{ ['--beam' as string]: tint }} title="Click to skip">
      <div className="ritual-beams">
        {heroes.map((h, i) => (
          <span key={h.id} className="ritual-beam" style={{ background: STAR_COLOR[shownStar(h, masterLevel) as Star], animationDelay: `${0.5 + i * 0.05}s` }} />
        ))}
      </div>
      {circle && <img className="px ritual-circle" src={circle} width={288} height={168} alt="" />}
      <div className="ritual-flash" />
      <div className="ritual-stars" style={{ color: tint }}>
        {'★'.repeat(best)}
      </div>
    </div>
  )
}

export function SummonScreen({ state, store }: { state: GameState; store: Store }) {
  const [pool, setPool] = useState<SummonPool>('normal')
  const [revealed, setRevealed] = useState<OwnedHero[]>([])
  const [ritual, setRitual] = useState<OwnedHero[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function pull(count: 1 | 10) {
    setErr(null)
    const prev = new Set(Object.keys(state.heroes))
    try {
      const next = store.dispatch({ type: 'SUMMON', pool, count })
      const pulled = Object.keys(next.heroes)
        .filter((id) => !prev.has(id))
        .map((id) => next.heroes[id as HeroId]!)
      setRevealed([])
      setRitual(pulled)
    } catch (e) {
      setErr(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Summon failed')
    }
  }

  const canOne = pool === 'normal' ? state.gold >= SUMMON_COST : state.gems >= ADV.costGems
  const canTen = state.gems >= ADV.tenPullGems

  return (
    <div className="screen">
      <h2>Mobius Summon</h2>
      <div className="summon-pools">
        <button className={`btn sm ${pool === 'normal' ? 'primary' : ''}`} onClick={() => setPool('normal')}>
          Normal · 1–3★
        </button>
        <button className={`btn sm ${pool === 'advanced' ? 'primary' : ''}`} onClick={() => setPool('advanced')}>
          ♦ Advanced · 3–5★
        </button>
      </div>
      <p className="sub">
        {pool === 'normal'
          ? `Normal pool · ${SUMMON_COST.toLocaleString()} Gold per pull · every hero is unique, no duplicates.`
          : `Advanced pool · ${ADV.costGems} gems per pull (${ADV.tenPullGems.toLocaleString()} for ten) · 4★+ arrive with an exclusive weapon and an engraving.`}
      </p>

      <div className="summon-stage">
        {revealed.length > 0 ? (
          <div className={`reveal ${revealed.length > 1 ? 'reveal-many' : ''}`}>
            {revealed.map((h) => (
              <HeroCard key={h.id} hero={h} showStats={revealed.length === 1} masterLevel={state.meta.masterLevel} />
            ))}
          </div>
        ) : (
          <div className="orb">
            <img className="px" src={cachedDataUrl('summon-orb', () => scale(drawProp('summonCrystal', 0).bmp, 5))} width={160} height={220} alt="The Mobius crystal" />
          </div>
        )}

        {pool === 'normal' ? (
          <div className="pity">
            Quality floor: <b>{state.gacha.pity}</b> / {PITY_AT} dry pulls → guaranteed ★★★
          </div>
        ) : (
          <div className="pity">
            Quality floor: <b>{state.gacha.advPity4}</b> / {ADV.pityFloor4At} → ★★★★ · <b>{state.gacha.advPity5}</b> /{' '}
            {ADV.pityFloor5At} → ★★★★★
          </div>
        )}

        <div className="summon-buttons">
          {pool === 'normal' ? (
            <button className="btn gold big" onClick={() => pull(1)} disabled={!canOne}>
              Summon · {SUMMON_COST.toLocaleString()} Gold
            </button>
          ) : (
            <>
              <button className="btn gem big" onClick={() => pull(1)} disabled={!canOne}>
                Summon · {ADV.costGems} ♦
              </button>
              <button className="btn gem big" onClick={() => pull(10)} disabled={!canTen}>
                Summon ×10 · {ADV.tenPullGems.toLocaleString()} ♦
              </button>
            </>
          )}
        </div>
        {!canOne && (
          <div className="muted">
            {pool === 'normal' ? 'Not enough Gold — clear tower floors to earn more.' : 'Not enough gems — the Friday Soulforge dungeon pays them.'}
          </div>
        )}
        {err && <div className="muted" style={{ color: 'var(--bad)' }}>{err}</div>}
      </div>
      {ritual && (
        <SummonRitual
          heroes={ritual}
          masterLevel={state.meta.masterLevel}
          onDone={() => {
            setRevealed(ritual)
            setRitual(null)
          }}
        />
      )}
    </div>
  )
}

// ── Roster ───────────────────────────────────────────────────────────────────
export function RosterScreen({ state, store }: { state: GameState; store?: Store }) {
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
            masterLevel={state.meta.masterLevel}
            onClick={() => setSel(sel === h.id ? null : h.id)}
          />
        ))}
      </div>
      {sel && store && state.heroes[sel] && (
        <div className="roster-bond">
          <HeroBond hero={state.heroes[sel]!} state={state} store={store} />
        </div>
      )}
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
  switch (p.kind) {
    case 'level-up':
      return `▲ ${who}'s ${name(p.skillId)} reached Lv ${p.level}`
    case 'merge':
      return `✦ ${who} fused ${name(p.from[0])} + ${name(p.from[1])} into ${name(p.skillId)}!`
    case 'unlock':
      return `✧ ${who} awakened a new skill: ${name(p.skillId)}`
    case 'achievement':
      return `🏆 ${who} earned ${name(p.skillId)}!`
  }
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

        {result.hiddenFound.length > 0 && (
          <div className="skill-progress">
            {result.hiddenFound.map((id) => {
              const h = HIDDEN_OBJECTIVES.find((x) => x.id === id)
              return (
                <div key={id} className="sp-row achievement">
                  ✧ Hidden objective: {h?.name ?? id}
                  {h?.reward.gems ? ` · +${h.reward.gems} gems` : ''}
                </div>
              )
            })}
          </div>
        )}

        {result.refusedHeroIds.length > 0 && (
          <div className="fallen">
            <div className="ft">✋ Refused to fight</div>
            {result.refusedHeroIds.map((id) => (
              <div key={id}>
                {state.heroes[id]?.name ?? id} <span className="muted">(Wary and broken — win back their trust)</span>
              </div>
            ))}
          </div>
        )}

        {result.worldSaved && (
          <div className="world-ended pframe" style={{ borderColor: 'var(--good)', color: '#c8f0d0' }}>
            You refused the win condition. The Herald falls, and the world beneath the tower is still there.
          </div>
        )}

        {result.worldEnded && (
          <div className="world-ended pframe">
            The ninetieth floor falls — and with it, the world beneath the tower. No one on its surface survives.
          </div>
        )}

        {result.loopRollback && (
          <div className="fallen">
            <div className="ft">↺ The loop resets</div>
            <div>The gate held. The waiting room drops back to floor {TUNING.tower.loop.fallbackTo}.</div>
          </div>
        )}

        {result.event && (
          <div className="muted" style={{ marginBottom: 10 }}>
            {result.event.kind === 'tournament'
              ? '🏆 A tournament gathers between the floors.'
              : result.event.kind === 'recovery'
                ? '✚ The tower offers a recovery floor.'
                : '✦ An event floor opens before the next climb.'}
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
