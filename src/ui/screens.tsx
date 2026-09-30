import { useEffect, useState } from 'react'
import { sfx } from './audio/sound'
import { drawSummonCircle } from './pixel/summonFx'
import { shownStar } from '../engine/shop'
import { crystalChargeLeft, mercySummonAvailable, tutorialPullAvailable } from '../engine/gacha'
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
import { t } from './i18n/i18n'

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
        {hasSave && (
          <button className="btn big" onClick={() => store.load()}>
            {t('Continue')}
          </button>
        )}
        <button
          className="btn primary big"
          onClick={() => store.dispatch({ type: 'NEW_ACCOUNT', seed: freshSeed(), now: Date.now() })}
        >
          {hasSave ? t('New Game') : t('Begin')}
        </button>
      </div>
      {hasSave && <div className="muted" style={{ marginTop: 14 }}>{t('Starting a new game overwrites your save.')}</div>}
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
    // The build-up: white light first, then each pillar takes its colour — the best last.
    const reveal = setTimeout(() => sfx(best >= 5 ? 'legend' : best >= 4 ? 'rare' : 'levelup'), 1900)
    const done = setTimeout(onDone, 2900)
    return () => {
      clearTimeout(reveal)
      clearTimeout(done)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const circle = cachedDataUrl(`circle|${tint}`, () => scale(drawSummonCircle(tint), 3))
  return (
    <div className="ritual" onClick={onDone} style={{ ['--beam' as string]: tint }} title={t('Click to skip')}>
      <div className="ritual-beams">
        {heroes.map((h, i) => {
          const star = shownStar(h, masterLevel)
          const isBest = star === best
          return (
            <span
              key={h.id}
              className={`ritual-beam ${isBest && best >= 4 ? 'rare' : ''}`}
              style={{
                ['--final' as string]: STAR_COLOR[star as Star],
                animationDelay: `${0.5 + i * 0.05}s, ${1.2 + (isBest ? 0.5 : i * 0.04)}s`,
              }}
            />
          )
        })}
      </div>
      {circle && <img className="px ritual-circle" src={circle} width={288} height={168} alt="" />}
      <div className="ritual-flash" />
      <div className="ritual-stars" style={{ color: tint }}>
        {Array.from({ length: best }, (_, i) => (
          <span key={i} className="ritual-star" style={{ animationDelay: `${1.9 + i * 0.12}s` }}>
            ★
          </span>
        ))}
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
            {revealed.map((h, i) => (
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
// The Party Board lives in its own module (list view, filters, drag and drop).
export { PartyScreen } from './party/PartyScreen'

// ── Results ──────────────────────────────────────────────────────────────────
/** One line of skill news for the results screen. */
export function skillProgressLine(p: SkillProgress, state: GameState): string {
  const who = state.heroes[p.heroId]?.name.split(/\s+/)[0] ?? t('A hero')
  const name = (id: string) => t(SKILLS[id]?.name ?? id)
  switch (p.kind) {
    case 'level-up':
      return t("▲ {who}'s {skill} reached Lv {n}", { who, skill: name(p.skillId), n: p.level })
    case 'merge':
      return t('✦ {who} fused {a} + {b} into {skill}!', { who, a: name(p.from[0]), b: name(p.from[1]), skill: name(p.skillId) })
    case 'unlock':
      return t('✧ {who} awakened a new skill: {skill}', { who, skill: name(p.skillId) })
    case 'achievement':
      return t('🏆 {who} earned {skill}!', { who, skill: name(p.skillId) })
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
  const retreated = result.result.outcome === 'retreat'
  const fallen = result.fallenHeroIds.map((id) => state.heroes[id]).filter(Boolean) as OwnedHero[]
  return (
    <div className="overlay">
      <div className="result-card">
        <div className={`big-outcome ${win ? 'win' : 'lose'}`}>{win ? t('FLOOR CLEARED') : failed ? t('MISSION FAILED') : retreated ? t('RETREATED') : t('DEFEATED')}</div>
        <div className="muted">
          {t('Floor {floor}', { floor: result.floor })}
          {result.firstClear && win ? ' · ' + t('first clear bonus!') : ''}
          {failed ? ' · ' + t('the escort fell — the floor must be retried') : ''}
          {retreated ? ' · ' + t('you pulled them out — everyone standing came home') : ''}
        </div>

        <div className="reward-row">
          <div className="r">
            <div className="n" style={{ color: 'var(--gold)' }}>+{result.goldAwarded.toLocaleString()}</div>
            <div className="l">{t('Gold')}</div>
          </div>
          <div className="r">
            <div className="n" style={{ color: 'var(--accent-2)' }}>+{result.xpAwarded}</div>
            <div className="l">{t('XP each')}</div>
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
                  ✧ {t('Hidden objective:')} {t(h?.name ?? id)}
                  {h?.reward.gems ? ` · ${t('+{n} gems', { n: h.reward.gems })}` : ''}
                </div>
              )
            })}
          </div>
        )}

        {result.refusedHeroIds.length > 0 && (
          <div className="fallen">
            <div className="ft">{t('✋ Refused to fight')}</div>
            {result.refusedHeroIds.map((id) => (
              <div key={id}>
                {state.heroes[id]?.name ?? id} <span className="muted">{t('(Wary and broken — win back their trust)')}</span>
              </div>
            ))}
          </div>
        )}

        {result.worldSaved && (
          <div className="world-ended pframe" style={{ borderColor: 'var(--good)', color: '#c8f0d0' }}>
            {t('You refused the win condition. The Herald falls, and the world beneath the tower is still there.')}
          </div>
        )}

        {result.worldEnded && (
          <div className="world-ended pframe">
            {t('The ninetieth floor falls — and with it, the world beneath the tower. No one on its surface survives.')}
          </div>
        )}

        {result.loopRollback && (
          <div className="fallen">
            <div className="ft">{t('↺ The loop resets')}</div>
            <div>{t('The gate held. The waiting room drops back to floor {fallbackTo}.', { fallbackTo: TUNING.tower.loop.fallbackTo })}</div>
          </div>
        )}

        {result.event && (
          <div className="muted" style={{ marginBottom: 10 }}>
            {result.event.kind === 'tournament'
              ? t('🏆 A tournament gathers between the floors.')
              : result.event.kind === 'recovery'
                ? t('✚ The tower offers a recovery floor.')
                : t('✦ An event floor opens before the next climb.')}
          </div>
        )}

        {fallen.length > 0 && (
          <div className="fallen">
            <div className="ft">{t('☠ Permanently lost')}</div>
            {fallen.map((h) => (
              <div key={h.id}>
                {h.name} <span className="muted">{t('({star}★ Lv{level})', { star: h.star, level: h.xp.level })}</span>
              </div>
            ))}
          </div>
        )}

        <button className="btn primary big" onClick={onContinue} style={{ marginTop: 8 }}>
          {win ? t('Onward ▸') : t('Regroup')}
        </button>
      </div>
    </div>
  )
}
