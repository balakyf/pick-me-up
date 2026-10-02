import { useState } from 'react'
import { SummonReveal, type RevealAgain } from './SummonReveal'
import { summonGate } from './summonGate'
import { toWorldTime } from '../../engine/time'
import type { GameState, HeroId, OwnedHero, SummonPool } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { HeroCard } from '../HeroCard'
import { cachedDataUrl } from '../pixel/render'
import { drawProp } from '../pixel/props'
import { scale } from '../pixel/bitmap'
import { t } from '../i18n/i18n'

const SUMMON_COST = TUNING.gacha.normalCostGold
const PITY_AT = TUNING.gacha.normalPityFloor3At

// ── Summon ───────────────────────────────────────────────────────────────────
const ADV = TUNING.gacha.advanced

export function SummonScreen({
  state,
  store,
  onNavigate,
}: {
  state: GameState
  store: Store
  /** Lets the reveal's lineup jump to the Party Board / Registry. */
  onNavigate?: (view: 'party' | 'roster') => void
}) {
  const [pool, setPool] = useState<SummonPool>('normal')
  const [revealed, setRevealed] = useState<OwnedHero[]>([])
  const [ritual, setRitual] = useState<{ heroes: OwnedHero[]; count: 1 | 10; pool: SummonPool; nonce: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function pull(count: 1 | 10) {
    setErr(null)
    const prev = new Set(Object.keys(state.heroes))
    try {
      // The real time rides with the pull: the crystal's charge is counted at this moment.
      const next = store.dispatch({ type: 'SUMMON', pool, count }, Date.now())
      const pulled = Object.keys(next.heroes)
        .filter((id) => !prev.has(id))
        .map((id) => next.heroes[id as HeroId]!)
      setRevealed([])
      setRitual({ heroes: pulled, count, pool, nonce: (ritual?.nonce ?? 0) + 1 })
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Summon failed'))
    }
  }

  // What each button may do, and the true reason when it may not (gold, gems or charge).
  // The charge is read as of now: the crystal refills with world days, and this scene
  // does not tick the clock the way the lobby does.
  const gate = summonGate(state, pool, toWorldTime(Date.now()))
  const { mercy, tutorial, charge, canOne } = gate
  const canTen = pool === 'advanced' && gate.canTen
  const canTenNormal = pool === 'normal' && gate.canTen

  /** The lineup's "summon again": same pool, same count, priced from the current state. */
  function againFor(count: 1 | 10): RevealAgain {
    const onClick = () => pull(count)
    if (pool === 'normal') {
      return count === 10
        ? { label: t('Summon ×10 · {gold} Gold', { gold: (SUMMON_COST * 10).toLocaleString() }), disabled: !canTenNormal, onClick }
        : {
            label: mercy ? t('Summon · free (the crystal takes pity)') : t('Summon · {SUMMON_COST} Gold', { SUMMON_COST: SUMMON_COST.toLocaleString() }),
            disabled: !canOne,
            onClick,
          }
    }
    return count === 10
      ? { label: t('Summon ×10 · {tenPullGems} ♦', { tenPullGems: ADV.tenPullGems.toLocaleString() }), disabled: !canTen, onClick }
      : { label: t('Summon · {costGems} ♦', { costGems: ADV.costGems }), disabled: !canOne, onClick }
  }

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
            {ADV.pityFloor5At} → ★★★★★ · {t('Crystal charge: {n}/{m} · +{k} each world-day', { n: charge, m: ADV.dailyCharge, k: ADV.rechargePerDay })}
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
        {gate.why && <div className="muted summon-why">{gate.why}</div>}
        {err && <div className="muted" style={{ color: 'var(--bad)' }}>{err}</div>}
      </div>
      {ritual && (
        <SummonReveal
          key={ritual.nonce}
          heroes={ritual.heroes}
          masterLevel={state.meta.masterLevel}
          pool={ritual.pool}
          onClose={() => {
            setRevealed(ritual.heroes)
            setRitual(null)
          }}
          onNavigate={onNavigate}
          again={againFor(ritual.count)}
        />
      )}
    </div>
  )
}
