import { useEffect, useRef, useState } from 'react'
import type { Command, GameState, HeroId, InterventionId, OwnedHero } from '../engine/types'
import type { Store } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { GIFTS, favorTier, favorTierName, giftDelta, giftPreferences, giftRepeats } from '../engine/favor'
import { INTERVENTIONS, INTERVENTION_LABEL, interventionCost, interventionRefusal } from '../engine/intervention'
import {
  frustrationDeal,
  loginClaimed,
  nextStreak,
  packagePrice,
  packageRefusal,
  todayOffer,
} from '../engine/shop'
import { worldDayIndex } from '../engine/daily'
import { toWorldTime } from '../engine/time'
import { hallRate } from '../engine/interference'
import { crackRefusal, dispatchRefusal } from '../engine/rift'
import { Portrait } from './bits'
import { PvpPanel } from './pvpPanels'
import { t } from './i18n/i18n'
import { withToasts } from './qol/toastStore'
import { HeroTag, pickerName } from './hero/heroLabel'

const SHOP = TUNING.shop
const PI = TUNING.interference
const RIFT = TUNING.rift

/** Run a command, surfacing the engine's refusal as a short message. */
function useRunner(store: Store): { run: (cmd: Command) => boolean; err: string | null } {
  const [err, setErr] = useState<string | null>(null)
  return {
    err,
    run(cmd: Command) {
      setErr(null)
      try {
        // Gifts, the login and monthly claims, packages: each says what it gave.
        withToasts(store).dispatch(cmd, Date.now())
        return true
      } catch (e) {
        setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
        return false
      }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A timing minigame (Blacksmithing strike / Ballista aim)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A marker sweeps across a bar; the Master stops it as close to the centre as they can.
 * Performance = 1 − distance from centre × 2. "Auto" resolves at the Master's skill.
 */
export function TimingGame({
  title,
  verb,
  skill,
  hint,
  onDone,
  onCancel,
}: {
  title: string
  verb: string
  skill: number
  hint: string
  onDone: (performance: number | undefined) => void
  onCancel: () => void
}) {
  const [pos, setPos] = useState(0)
  const [stopped, setStopped] = useState<number | null>(null)
  const dir = useRef(1)
  useEffect(() => {
    if (stopped !== null) return
    const t = setInterval(() => {
      setPos((p) => {
        let n = p + 0.035 * dir.current
        if (n >= 1) {
          n = 1
          dir.current = -1
        } else if (n <= 0) {
          n = 0
          dir.current = 1
        }
        return n
      })
    }, 30)
    return () => clearInterval(t)
  }, [stopped])
  const perf = stopped === null ? null : Math.max(0, 1 - Math.abs(stopped - 0.5) * 2)
  return (
    <div className="overlay">
      <div className="result-card timing-game">
        <div className="big-outcome win" style={{ fontSize: 28 }}>
          {title}
        </div>
        <div className="muted">{hint}</div>
        <div className="tg-bar">
          <div className="tg-zone" />
          <div className="tg-marker" style={{ left: `${(stopped ?? pos) * 100}%` }} />
        </div>
        {perf === null ? (
          <div className="tg-actions">
            <button className="btn primary big" onClick={() => setStopped(pos)}>
              {verb}!
            </button>
            <button className="btn" onClick={() => onDone(undefined)} title={t('Let your practiced hands decide')}>
              {t('Auto ({n}%)', { n: Math.round(skill * 100) })}
            </button>
            <button className="btn ghost" onClick={onCancel}>
              {t('Cancel')}
            </button>
          </div>
        ) : (
          <div className="tg-actions">
            <div className="tg-score">{t('Performance {n}%', { n: Math.round(perf * 100) })}</div>
            <button className="btn primary big" onClick={() => onDone(perf)}>
              {t('Continue ▸')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero bond: favor, gifts and interventions (Layer 3 §C1/§D2)
// ─────────────────────────────────────────────────────────────────────────────

export function HeroBond({ hero, state, store }: { hero: OwnedHero; state: GameState; store: Store }) {
  const { run, err } = useRunner(store)
  if (!hero.alive) return null
  const tier = favorTier(hero.favor)
  const pref = giftPreferences(hero.id)
  const knowsTaste = tier >= 2
  return (
    <div className="pframe hero-bond">
      <div className="bond-head">
        <Portrait hero={hero} size="sm" />
        <div>
          <div className="bond-name">{hero.name}</div>
          <div className="muted">
            {t('♥ {n} · {favor}/100 · IP {ip}', { n: t(favorTierName(hero.favor)), favor: hero.favor, ip: hero.ip })}
            {hero.expedition && ' · ' + t('away in the Ruins')}
            {hero.blessed && ' · ' + t('blessed')}
          </div>
        </div>
      </div>
      <div className="gauge bond-gauge">
        <span style={{ width: `${hero.favor}%` }} />
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {knowsTaste
          ? t("Loves {liked}; can't stand {disliked}.", { liked: t(pref.liked), disliked: t(pref.disliked) })
          : t('Warm up to this hero to learn what they like.')}
      </div>

      <h4 className="panel-sub">{t('Gifts')}</h4>
      <div className="gift-grid">
        {Object.values(GIFTS).map((g) => {
          const d = giftDelta(hero, g.id)
          const afford = state.gold >= g.gold && state.gems >= g.gems
          return (
            <button
              key={g.id}
              className="gift-btn"
              disabled={!afford}
              onClick={() => run({ type: 'GIVE_GIFT', heroId: hero.id, giftId: g.id })}
              title={knowsTaste ? t('{d} favor', { d: `${d >= 0 ? '+' : ''}${d}` }) : t('Give a gift')}
            >
              <span>{t(g.name)}</span>
              <span className="muted">{g.gems > 0 ? `${g.gems} ♦` : `${g.gold} ◆`}</span>
              {giftRepeats(hero, g.id) > 0 && <span className="gift-repeat">{t('again ×{streak}', { streak: giftRepeats(hero, g.id) })}</span>}
            </button>
          )
        })}
      </div>

      <h4 className="panel-sub">{t('Interventions')}</h4>
      {tier < TUNING.intervention.minTier ? (
        <div className="muted" style={{ fontSize: 13 }}>
          {t('Only a Devoted hero will bend the system for you. ({ip} IP saved)', { ip: hero.ip })}
        </div>
      ) : (
        <div className="drill-list">
          {INTERVENTIONS.map((a: InterventionId) => {
            const why = interventionRefusal(state, hero.id, a)
            return (
              <div key={a} className={`drill-row ${why ? 'off' : ''}`} title={why ? t(why) : undefined}>
                <span className="skill-grade">{interventionCost(a)}</span>
                <span className="drill-name">{t(INTERVENTION_LABEL[a])}</span>
                <span />
                <button className="btn sm" disabled={why !== null} onClick={() => run({ type: 'INTERVENE', heroId: hero.id, action: a })}>
                  {t('Use')}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The Gem Shop (Layer 3 §D3 — simulated money)
// ─────────────────────────────────────────────────────────────────────────────

export function ShopPanel({ state, store }: { state: GameState; store: Store }) {
  const { run, err } = useRunner(store)
  const nowWorld = toWorldTime(Date.now())
  const day = worldDayIndex(nowWorld)
  const offer = todayOffer(day)
  const claimed = loginClaimed(state, nowWorld)
  const m = state.meta.monthly
  const ids = Object.keys(SHOP.packages).filter((id) => id !== 'so_close' || frustrationDeal(state))
  return (
    <div className="lr-action shop-panel">
      <div className="shop-note">{t('Isel smiles. “Everything here is for your own good, Master.” — money here is simulated; nothing is ever charged.')}</div>

      <div className="ta-row">
        <span>{t('Daily login · streak {streak}', { streak: state.meta.login.streak })}</span>
        <button className="btn sm gem" disabled={claimed} onClick={() => run({ type: 'CLAIM_LOGIN' })}>
          {claimed ? t('Claimed today') : `${t('Claim')} +${SHOP.loginGems}${nextStreak(state, nowWorld) % 7 === 0 ? ` +${SHOP.streakBonusGems}` : ''} ♦`}
        </button>
      </div>
      {nextStreak(state, nowWorld) === 1 && state.meta.login.streak > 1 && !claimed && (
        <div className="muted" style={{ color: 'var(--warn)', fontSize: 13 }}>
          {t('You missed a day — your {streak}-day streak is gone.', { streak: state.meta.login.streak })}
        </div>
      )}
      {m && (
        <div className="ta-row">
          <span>{t('Monthly Package · {daysLeft} days left', { daysLeft: m.daysLeft })}</span>
          <button className="btn sm gem" disabled={m.lastClaimDay === day} onClick={() => run({ type: 'CLAIM_MONTHLY' })}>
            {m.lastClaimDay === day ? t('Claimed today') : `${t('Claim')} +${SHOP.monthlyGems} ♦ +${SHOP.monthlyGold.toLocaleString()} ◆`}
          </button>
        </div>
      )}

      {frustrationDeal(state) && <div className="shop-deal">{t('So close! Your next 4★ is right around the corner…')}</div>}

      <h4 className="panel-sub">{t('Packages')}</h4>
      <div className="drill-list">
        {ids.map((id) => {
          const pkg = SHOP.packages[id]!
          const why = packageRefusal(state, id)
          const discounted = id === offer
          return (
            <div key={id} className={`drill-row ${why ? 'off' : ''} ${discounted ? 'deal' : ''}`} title={why ? t(why) : undefined}>
              <span className="skill-grade">{discounted ? '%' : '♦'}</span>
              <span className="drill-name">
                {t(pkg.label)}
                {pkg.gems > 0 && ` · ${pkg.gems.toLocaleString()} ♦`}
                {pkg.gold > 0 && ` · ${pkg.gold.toLocaleString()} ◆`}
                {discounted && <b className="today-tag"> {t('TODAY ONLY')}</b>}
              </span>
              <span className="muted">
                {discounted && <s>${pkg.usd.toFixed(2)}</s>} ${packagePrice(id, day).toFixed(2)}
              </span>
              <button className="btn sm" disabled={why !== null} onClick={() => run({ type: 'BUY_PACKAGE', packageId: id })}>
                {t('Buy')}
              </button>
            </div>
          )
        })}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        {t('Simulated spend so far: ${spentUsd}', { spentUsd: state.meta.wallet.spentUsd.toFixed(2) })}
      </div>
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hall of Magic (Probability Interference) and the Crack of Time & Space
// ─────────────────────────────────────────────────────────────────────────────

export function HallOfMagicInfo({ state }: { state: GameState }) {
  const level = state.facilities.hallOfMagic.level
  return (
    <div className="lr-action">
      <div className="ta-row">
        <span>{t('Probability Interference')}</span>
        <span className="ta-val">{state.meta.pi.toFixed(1)}</span>
      </div>
      <div className="ta-row">
        <span>{t('Hall generation')}</span>
        <span className="ta-val">{t('+{n}/world-hour', { n: hallRate(level) })}</span>
      </div>
      <div className="lr-action-note">
        {t('The world grows steadier while you play and fades while you are away. Thresholds: Hall of Magic {hallOfMagic} · Crack of Time {crack}.', { hallOfMagic: PI.unlock.hallOfMagic, crack: PI.unlock.crack })}
      </div>
    </div>
  )
}

export function RiftPanel({ state, store }: { state: GameState; store: Store }) {
  const { run, err } = useRunner(store)
  const [team, setTeam] = useState<HeroId[]>([])
  const nowWorld = toWorldTime(Date.now())
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const away = living.filter((h) => h.expedition)
  if (!state.meta.crackOpen) {
    const why = crackRefusal(state)
    return (
      <div className="lr-action">
        <div className="lr-action-note">
          {t('A hairline crack in the air. Opening it needs Master Lv {masterLevel}, a {mageStar}★ mage to hold it, {gold} gold and {stones} Promotion Stones. Once open, the Ruins beyond pay in gems — and other Masters can come through.', { masterLevel: RIFT.masterLevel, mageStar: RIFT.mageStar, gold: RIFT.gold.toLocaleString(), stones: RIFT.stones })}
        </div>
        <button className="btn primary" disabled={why !== null} onClick={() => run({ type: 'OPEN_CRACK' })} title={why ? t(why) : undefined}>
          {t('Open the Crack of Time and Space')}
        </button>
        {why && <div className="muted" style={{ fontSize: 13 }}>{t(why)}</div>}
        {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
      </div>
    )
  }
  const free = living.filter((h) => !h.expedition && !h.captiveOf && h.training === null && h.promotion === null)
  const why = dispatchRefusal(state, team)
  return (
    <div className="lr-action">
      <div className="lr-action-note">{t('The crack is open. Send up to {maxTeam} heroes into the Ruins ({n} world-hours).', { maxTeam: RIFT.maxTeam, n: RIFT.expeditionMs / 3_600_000 })}</div>
      {away.length > 0 && (
        <>
          <h4 className="panel-sub">{t('In the Ruins')}</h4>
          {away.map((h) => (
            <div key={h.id} className="promo-row">
              <span className="promo-name">{pickerName(state, h)}</span>
              <span className="muted">{t('{n} world-min', { n: Math.max(0, Math.ceil((h.expedition!.completesAtWorld - nowWorld) / 60_000)) })}</span>
            </div>
          ))}
        </>
      )}
      <h4 className="panel-sub">{t('Expedition team')}</h4>
      <div className="syn-row">
        {free.map((h) => (
          <button
            key={h.id}
            type="button"
            className={`syn-chip ${team.includes(h.id) ? 'sel' : ''}`}
            onClick={() => setTeam((t) => (t.includes(h.id) ? t.filter((x) => x !== h.id) : [...t, h.id]))}
          >
            <Portrait hero={h} size="sm" />
            <span className="syn-chip-name">
              {pickerName(state, h)} <HeroTag hero={h} />
            </span>
          </button>
        ))}
      </div>
      <button
        className="btn primary"
        disabled={why !== null}
        onClick={() => {
          if (run({ type: 'DISPATCH_RUINS', heroIds: team })) setTeam([])
        }}
      >
        {t('Dispatch')} {team.length || ''}
      </button>
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
      <h4 className="panel-sub">{t('Other Masters')}</h4>
      <PvpPanel state={state} store={store} />
    </div>
  )
}
