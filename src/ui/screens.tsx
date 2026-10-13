import { useState } from 'react'
import { crystalChargeLeft, mercySummonAvailable, tutorialPullAvailable } from '../engine/gacha'
import type { GameState, HeroId, Line, OwnedHero } from '../engine/types'
import type { Store } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { HeroCard } from './HeroCard'
import { HeroBond } from './metaPanels'
import { cpOf, Stars, Portrait } from './bits'
import { BROKEN_SAVE_KEY, freshSeed } from './useGame'
import { DEFAULT_SAVE_KEY } from '../engine/account'
import { RevealSequence } from './summon/RevealSequence'
import { revealOrder } from './summon/reveal'
import { heroFrameUrl } from './pixel/sprites'
import { cachedDataUrl } from './pixel/render'
import { drawProp } from './pixel/props'
import { scale } from './pixel/bitmap'
import type { Element, HeroClass, Star, SummonPool } from '../engine/types'
import { t } from './i18n/i18n'
import './summon/summon.css'

/** Moved to ./ResultsScreen (WP0); re-exported for compatibility. */
export { ResultsScreen, skillProgressLine } from './ResultsScreen'

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

/**
 * Is the save on disk the one that already failed to load? useGame copies an unreadable
 * save to BROKEN_SAVE_KEY and leaves the original in place, so the two match exactly
 * until a new game overwrites the save. Storage errors read as "not broken".
 */
export function saveLooksBroken(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const broken = window.localStorage.getItem(BROKEN_SAVE_KEY)
    return broken !== null && broken === window.localStorage.getItem(DEFAULT_SAVE_KEY)
  } catch {
    return false
  }
}

export function TitleScreen({ store, hasSave }: { store: Store; hasSave: boolean }) {
  // A save that could not be read gets no dead Continue button: say so, keep New Game.
  // App passes hasSave=false for it (continuableSave()), so the title checks the kept copy
  // itself: the broken save is still on disk, and a new game will overwrite it.
  const [broken, setBroken] = useState(() => saveLooksBroken())
  const canContinue = hasSave && !broken
  function resume() {
    try {
      store.load()
    } catch (err) {
      try {
        const raw = window.localStorage.getItem(DEFAULT_SAVE_KEY)
        if (raw !== null) window.localStorage.setItem(BROKEN_SAVE_KEY, raw)
      } catch {
        /* storage may be unavailable */
      }
      console.error('Could not load the save.', err)
      setBroken(true)
    }
  }
  return (
    <div className="title-wrap">
      <div className="subtitle">{t('Infinite Gacha')}</div>
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
        {t('Summon unique heroes from the Mobius gacha, build a party of five, and climb the permadeath tower. Every hero is one of a kind. Every death is forever.')}
      </div>
      <div className="btns">
        {canContinue && (
          <button className="btn big" onClick={resume}>
            {t('Continue')}
          </button>
        )}
        <button
          className="btn primary big"
          onClick={() => store.dispatch({ type: 'NEW_ACCOUNT', seed: freshSeed(), now: Date.now() })}
        >
          {hasSave || broken ? t('New Game') : t('Begin')}
        </button>
      </div>
      {broken && (
        <div className="save-broken" role="alert">
          {t('This save could not be read. A copy was kept.')}
        </div>
      )}
      {canContinue && <div className="muted" style={{ marginTop: 14 }}>{t('Starting a new game overwrites your save.')}</div>}
    </div>
  )
}

// ── Summon ───────────────────────────────────────────────────────────────────
const ADV = TUNING.gacha.advanced

/** The summary grid after the theatre: the best of the pull first (the theatre's order, reversed). */
function summaryOrder(heroes: OwnedHero[], masterLevel: number): OwnedHero[] {
  return revealOrder(heroes, masterLevel)
    .reverse()
    .map((c) => c.hero)
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
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Summon failed'))
    }
  }

  const mercy = pool === 'normal' && mercySummonAvailable(state)
  const tutorial = tutorialPullAvailable(state)
  const charge = crystalChargeLeft(state)
  const canOne = pool === 'normal' ? state.gold >= SUMMON_COST || mercy : state.gems >= ADV.costGems && charge >= 1
  const canTen = state.gems >= ADV.tenPullGems && charge >= 10
  const canTenNormal = tutorial || state.gold >= SUMMON_COST * 10

  return (
    <div className="screen">
      <h2>{t('Mobius Summon')}</h2>
      <div className="summon-pools">
        <button className={`btn sm ${pool === 'normal' ? 'primary' : ''}`} onClick={() => setPool('normal')}>
          {t('Normal · 1–3★')}
        </button>
        <button className={`btn sm ${pool === 'advanced' ? 'primary' : ''}`} onClick={() => setPool('advanced')}>
          {t('♦ Advanced · 3–5★')}
        </button>
      </div>
      <p className="sub">
        {pool === 'normal'
          ? t('Normal pool · {gold} Gold per pull · every hero is unique, no duplicates.', { gold: SUMMON_COST.toLocaleString() })
          : t('Advanced pool · {gems} gems per pull ({ten} for ten) · 4★+ arrive with an exclusive weapon and an engraving.', {
              gems: ADV.costGems,
              ten: ADV.tenPullGems.toLocaleString(),
            })}
      </p>

      <div className="summon-stage">
        {revealed.length > 0 ? (
          <div className={`reveal ${revealed.length > 1 ? 'reveal-many' : ''}`}>
            {summaryOrder(revealed, state.meta.masterLevel).map((h, i) => (
              <div key={h.id} className="flip-in" style={{ animationDelay: `${i * 0.12}s` }}>
                <HeroCard hero={h} showStats={revealed.length === 1} masterLevel={state.meta.masterLevel} />
              </div>
            ))}
          </div>
        ) : (
          <div className="orb">
            <img className="px" src={cachedDataUrl('summon-orb', () => scale(drawProp('summonCrystal', 0).bmp, 5))} width={160} height={220} alt={t('The Mobius crystal')} />
          </div>
        )}

        {pool === 'normal' ? (
          <div className="pity">
            {t('Quality floor:')} <b>{state.gacha.pity}</b> / {PITY_AT} {t('dry pulls → guaranteed ★★★')}
          </div>
        ) : (
          <div className="pity">
            {t('Quality floor:')} <b>{state.gacha.advPity4}</b> / {ADV.pityFloor4At} → ★★★★ · <b>{state.gacha.advPity5}</b> /{' '}
            {ADV.pityFloor5At} → ★★★★★ · {t('Crystal charge: {n}/{m} today', { n: charge, m: ADV.dailyCharge })}
          </div>
        )}

        <div className="summon-buttons">
          {pool === 'normal' ? (
            <>
              <button className="btn gold big" onClick={() => pull(1)} disabled={!canOne}>
                {mercy ? t('Summon · free (the crystal takes pity)') : t('Summon · {SUMMON_COST} Gold', { SUMMON_COST: SUMMON_COST.toLocaleString() })}
              </button>
              <button className={`btn gold big ${tutorial ? 'pulse' : ''}`} onClick={() => pull(10)} disabled={!canTenNormal}>
                {tutorial
                  ? t('Summon ×10 · free (your first summon)')
                  : t('Summon ×10 · {gold} Gold', { gold: (SUMMON_COST * 10).toLocaleString() })}
              </button>
            </>
          ) : (
            <>
              <button className="btn gem big" onClick={() => pull(1)} disabled={!canOne}>
                {t('Summon · {costGems} ♦', { costGems: ADV.costGems })}
              </button>
              <button className="btn gem big" onClick={() => pull(10)} disabled={!canTen}>
                {t('Summon ×10 · {tenPullGems} ♦', { tenPullGems: ADV.tenPullGems.toLocaleString() })}
              </button>
            </>
          )}
        </div>
        {!canOne && (
          <div className="muted">
            {pool === 'normal'
              ? t('Not enough Gold — clear tower floors to earn more.')
              : t('Not enough gems — the Friday Soulforge dungeon pays them.')}
          </div>
        )}
        {err && <div className="muted" style={{ color: 'var(--bad)' }}>{err}</div>}
      </div>
      {ritual && (
        <RevealSequence
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
      <h2>{t('Roster')}</h2>
      <p className="sub">
        {heroes.length === 1 ? t('1 hero') : t('{n} heroes', { n: heroes.length })} · {t('{n} living · click a card for full stats.', { n: living })}
      </p>
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
      <h2>{t('Party')}</h2>
      <p className="sub">{t('Up to five heroes. Slots 1–2 stand front, 3 mid, 4–5 back. Total CP {partyCP}.', { partyCP: partyCP.toLocaleString() })}</p>

      <div className="party-slots">
        {draft.map((id, i) => {
          const h = id ? state.heroes[id] : undefined
          return (
            <div
              key={i}
              className={`slot ${h ? 'filled' : ''}`}
              onClick={() => h && clearSlot(i)}
              title={h ? t('Click to remove') : t('Empty')}
            >
              <span className="line-tag">{t(PARTY_LINES[i]!)}</span>
              {h ? (
                <div style={{ textAlign: 'center' }}>
                  <Portrait hero={h} />
                  <div className="hname" style={{ fontSize: 13 }}>{h.name}</div>
                  <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
                    <Stars star={h.star} />
                    <span className="cp"><span className="lab">{t('CP')} </span>{cpOf(h)}</span>
                  </div>
                </div>
              ) : (
                <span>{t('+ empty')}</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="row" style={{ margin: '8px 0 20px' }}>
        <button className="btn primary" onClick={save} disabled={!dirty}>
          {saved && !dirty ? t('✓ Saved') : t('Save Party')}
        </button>
        <span className="muted">{t('{n}/5 deployed', { n: draft.filter(Boolean).length })}</span>
      </div>

      <h3 style={{ margin: '0 0 10px' }}>{t('Available heroes')}</h3>
      <div className="grid cards">
        {living.map((h) => (
          <HeroCard key={h.id} hero={h} selected={inParty(h.id)} onClick={() => addHero(h.id)} />
        ))}
        {living.length === 0 && <div className="empty">{t('No living heroes. Summon to recruit.')}</div>}
      </div>
    </div>
  )
}
