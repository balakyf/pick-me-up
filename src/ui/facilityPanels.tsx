import { useState } from 'react'
import type { GameState, OwnedHero, FacilityId, HeroId, EquipmentSlot, Command, RescueChoice, EquipmentItem } from '../engine/types'
import type { Store } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { banquetWouldHelp } from '../engine/kitchen'
import { canPromote, canAfford, promotionCost, promotionPayment, promotionTargetStar } from '../engine/promotion'
import { tacticalFocusBonus, tacticalOverlookSlots } from '../engine/tactical'
import { masterXpToNext } from '../engine/master'
import { upgradeCost, canUpgrade, unlockMasterLevel } from '../engine/facilities'
import { worldDayIndex, dailyDungeonFor, dailyUnlocked, dailyAttemptsLeft } from '../engine/daily'
import type { DailyReward } from '../engine/daily'
import { attemptDailyWithResult } from '../engine/store'
import { toWorldTime } from '../engine/time'
import { canSynthesize, rescueOptions, synthesisPreview, synthesisUnlocked, type SynthesisInput } from '../engine/synthesis'
import { fuseOptions, maxTransferGrade, transferCost, transferRefusal, transferredLevel } from '../engine/transfer'
import { smithyUnlocked, forgeGrade, forgeCost, canCraft, itemName, equippedItemIds } from '../engine/equipment'
import { Portrait, SkillList } from './bits'
import { SKILLS } from '../engine/content'
import { maxTrainableGrade, drillXp, trainingOptions } from '../engine/training'
import { skillProgressLine } from './screens'
import { HallOfMagicInfo, RiftPanel, ShopPanel, TimingGame } from './metaPanels'
import { GuildPanel } from './pvpPanels'
import { upgradeCost as forgeUpgradeCost, upgradeOdds, upgradeRefusal } from '../engine/minigames'
import { upgradeEquipmentWithResult } from '../engine/store'
import { t } from './i18n/i18n'
import { DormitoryInfo, ForgeOrderSection, HereNow, KitchenPantry, LibraryInfo, MemorialPanel, StaffSection, WatchtowerInfo } from './life/lifePanels'
import { WeeklyTrialLauncher } from './challenge/WeeklyTrial'

/**
 * Facility panels — the rules-facing half of the Lobby. The walkable world
 * (world/LobbyWorld) opens these inside an RPG window when the Master uses a
 * facility; every action still goes through the engine's Commands unchanged.
 */

const SANITY_MAX = TUNING.lobby.sanityMax

/** Decide which room a hero is "in" right now. Cosmetic, deterministic. */
export function roomFor(
  hero: OwnedHero,
  partyIds: Set<string>,
): 'kitchen' | 'promotionChamber' | 'tacticalCenter' | 'hall' | 'training' {
  if (hero.training !== null) return 'training' // mid-drill → in the Training Yard
  if (hero.sanity < 60) return 'kitchen' // low morale → resting in the Kitchen
  if (hero.xp.atCap) return 'promotionChamber' // capped → waiting on promotion
  if (partyIds.has(hero.id)) return 'tacticalCenter' // on the active party → on duty
  return 'hall'
}

export function sanityColor(s: number): string {
  if (s >= 60) return 'var(--good)'
  if (s >= 30) return 'var(--warn)'
  return 'var(--bad)'
}

/** Heroes currently in a room, as bust chips with their morale gauge. */
function Occupants({ heroes, empty }: { heroes: OwnedHero[]; empty: string }) {
  if (heroes.length === 0) return <div className="lr-empty">{empty}</div>
  return (
    <div className="occupants">
      {heroes.map((h) => (
        <div key={h.id} className="occupant" title={`${h.name} · ${t('Sanity')} ${h.sanity}/${SANITY_MAX}`}>
          <Portrait hero={h} size="sm" />
          <span className="lh-name">{h.name.split(/\s+/)[0]}</span>
          <span className="lh-sanity">
            <span style={{ width: `${Math.round((h.sanity / SANITY_MAX) * 100)}%`, background: sanityColor(h.sanity) }} />
          </span>
        </div>
      ))}
    </div>
  )
}

const BANQUET = TUNING.lobby.banquet

/** The Kitchen's interactive Banquet action: spend gold → roster-wide Sanity. */
function BanquetAction({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)
  const canAfford = state.gold >= BANQUET.gold
  const helps = banquetWouldHelp(state)
  const disabled = !canAfford || !helps

  function hold() {
    setErr(null)
    try {
      store.dispatch({ type: 'BANQUET' }, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Banquet failed'))
    }
  }

  return (
    <div className="lr-action">
      <button className="btn gold sm" onClick={hold} disabled={disabled}>
        {t('🍴 Banquet · {gold} ◆', { gold: BANQUET.gold.toLocaleString() })}
      </button>
      <div className="lr-action-note">
        {!canAfford
          ? t('Not enough gold.')
          : !helps
            ? t('Everyone is at full morale.')
            : t('+{n} Sanity to all living heroes.', { n: BANQUET.restore })}
      </div>
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

const SKIP_GEMS = TUNING.lobby.promotion.skipGemCost

/** Human-readable "time left" for a promotion countdown (cosmetic; whole units). */
export function timeLeft(ms: number): string {
  if (ms <= 0) return t('finishing…')
  const mins = Math.ceil(ms / 60_000)
  if (mins < 60) return t('{m}m left', { m: mins })
  return t('{h}h {m}m left', { h: Math.floor(mins / 60), m: mins % 60 })
}

/** The Promotion Chamber's actions: promote at-cap heroes, or skip a running timer. */
function PromotionAction({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)
  const nowWorld = toWorldTime(Date.now())
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const promoting = living.filter((h) => h.promotion !== null)
  const ready = living.filter(canPromote)

  function dispatch(cmd: Parameters<Store['dispatch']>[0]) {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Action failed'))
    }
  }

  if (promoting.length === 0 && ready.length === 0) {
    return <div className="lr-action-note">{t('No heroes are at their star cap yet — keep climbing.')}</div>
  }

  return (
    <div className="lr-action promo-action">
      {promoting.map((h) => (
        <div key={h.id} className="promo-row">
          <span className="promo-name">{h.name.split(/\s+/)[0]} → {promotionTargetStar(h)}★</span>
          <span className="muted">{timeLeft(h.promotion!.completesAtWorld - nowWorld)}</span>
          <button
            className="btn gem sm"
            onClick={() => dispatch({ type: 'SKIP_TIMER', kind: 'promotion', id: h.id })}
            disabled={state.gems < SKIP_GEMS}
            title={t('Finish now for {n} gems', { n: SKIP_GEMS })}
          >
            ⏩ {SKIP_GEMS} 💎
          </button>
        </div>
      ))}
      {ready.map((h) => {
        const cost = promotionCost(h)
        const affordable = canAfford(state, h)
        const rankCover = promotionPayment(state, h)?.rankMaterial ?? 0
        return (
          <div key={h.id} className="promo-row">
            <span className="promo-name">{h.name.split(/\s+/)[0]} → {promotionTargetStar(h)}★</span>
            <span className="muted">
              {Object.entries(cost)
                .map(([k, v]) => `${v} ${matLabel(k)}`)
                .join(' · ')}
              {rankCover > 0 && ` · ${t('{n} Rank Mat cover the missing stones', { n: rankCover })}`}
            </span>
            <button
              className="btn sm"
              onClick={() => dispatch({ type: 'PROMOTE_HERO', heroId: h.id })}
              disabled={!affordable}
              title={affordable ? t('Begin promotion') : t('Not enough materials')}
            >
              {t('⬆ Promote')}
            </button>
          </div>
        )
      })}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

const FAC = TUNING.lobby.facilities

/** Upgrade control shared by every facility room: build/skip + Master-Level gating. */
export function UpgradeControl({ state, store, facility }: { state: GameState; store: Store; facility: FacilityId }) {
  const [err, setErr] = useState<string | null>(null)
  const f = state.facilities[facility]
  const nowWorld = toWorldTime(Date.now())

  function dispatch(cmd: Parameters<Store['dispatch']>[0]) {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Action failed'))
    }
  }

  // Build in progress → countdown + gem skip.
  if (f.build !== null) {
    return (
      <div className="lr-upgrade">
        <span className="muted">{t('⏳ Lv {toLevel} · {n}', { toLevel: f.build.toLevel, n: timeLeft(f.build.completesAtWorld - nowWorld) })}</span>
        <button
          className="btn gem sm"
          onClick={() => dispatch({ type: 'SKIP_TIMER', kind: 'facility', id: facility })}
          disabled={state.gems < FAC.skipGemCost}
        >
          ⏩ {FAC.skipGemCost} 💎
        </button>
      </div>
    )
  }

  const maxed = f.level >= FAC.maxLevel
  const unlockAt = unlockMasterLevel(facility)
  const chamberLocked = f.level === 0 && state.meta.masterLevel < unlockAt
  const mlCapped = !maxed && f.level >= state.meta.masterLevel
  const cost = upgradeCost(facility, f.level)
  const ok = canUpgrade(state, facility)
  const isBuild = f.level === 0

  const note = maxed
    ? t('Max level reached.')
    : chamberLocked
      ? t('Unlocks at Master Lv {unlockMasterLevel}.', { unlockMasterLevel: unlockAt })
      : mlCapped
        ? t('Raise Master Level to upgrade.')
        : state.gold < cost
          ? t('Not enough gold.')
          : t('Lv {n}: faster/stronger effects.', { n: f.level + 1 })

  return (
    <div className="lr-upgrade">
      <span className="lr-action-note">{note}</span>
      {!maxed && (
        <button className="btn sm" onClick={() => dispatch({ type: 'UPGRADE_FACILITY', facility })} disabled={!ok}>
          {isBuild ? '🔨 Build' : '⬆ Upgrade'} · {cost.toLocaleString()} ◆
        </button>
      )}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

/** The Tactical Center's current combat levers (read-only; upgrades deferred). */
function TacticalAction({ state }: { state: GameState }) {
  const level = state.facilities.tacticalCenter.level
  const bonusPct = Math.round(tacticalFocusBonus(level) * 100)
  const slots = tacticalOverlookSlots(level)
  return (
    <div className="lr-action tactical-action">
      <div className="ta-row"><span>{t('🎯 Focus damage')}</span><span className="ta-val">+{bonusPct}%</span></div>
      <div className="ta-row"><span>{t('🛡 Overlook slots')}</span><span className="ta-val">{slots}</span></div>
      <div className="lr-action-note">{t('Mark a target in the Tower to concentrate fire.')}</div>
    </div>
  )
}

const DAILY = TUNING.lobby.daily
const MAT_LABEL: Record<string, string> = {
  promotionStone: '🪨 Stone',
  rankMaterial: '📦 Rank Mat',
  bookOfReverseHeaven: '📕 Book of Reverse Heaven',
}
const matLabel = (id: string): string =>
  MAT_LABEL[id] !== undefined ? t(MAT_LABEL[id]) : id.startsWith('attrStone_') ? `🔹 ${id.slice('attrStone_'.length)}` : id

/** One-line summary of a daily reward bundle. */
function rewardSummary(r: DailyReward): string {
  const parts: string[] = []
  if (r.gold) parts.push(`+${r.gold.toLocaleString()} ◆`)
  if (r.gems) parts.push(`+${r.gems} 💎`)
  if (r.heroXp) parts.push(`+${r.heroXp} XP`)
  for (const id of Object.keys(r.materials ?? {})) parts.push(`+${r.materials![id]} ${matLabel(id)}`)
  return parts.join(' · ') || t('a reward')
}

/** The Daily Dungeon portal: an access point (not a leveled facility). */
function DailyPortal({ state, store }: { state: GameState; store: Store }) {
  const [last, setLast] = useState<{ cleared: boolean; text: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const dayIndex = worldDayIndex(toWorldTime(Date.now()))
  const dungeon = dailyDungeonFor(dayIndex)
  const unlocked = dailyUnlocked(state)
  const free = dailyAttemptsLeft(state)
  const paid = free === 0
  const canPay = !paid || state.gems >= DAILY.extraAttemptGemCost
  const disabled = !unlocked || !canPay

  function enter() {
    setErr(null)
    try {
      const now = Date.now() // one timestamp for preview + dispatch (results must match)
      const { result } = attemptDailyWithResult(state, now)
      store.dispatch({ type: 'ATTEMPT_DAILY' }, now)
      setLast({
        cleared: result.cleared,
        text:
          (result.cleared ? `${t('Cleared!')} ${rewardSummary(result.rewards)}` : t('Failed — no reward this run.')) +
          result.skillProgress.map((p) => ` ${skillProgressLine(p, store.getState() ?? state)}`).join(''),
      })
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Run failed'))
    }
  }

  return (
    <div className="lobby-portal">
      <div className="lp-head">
        <span className="lp-glyph">🌀</span>
        <span className="lp-name">{t('Daily Dungeon')}</span>
        <span className="lp-today">{t(dungeon.weekday)} · {t(dungeon.name)}</span>
      </div>
      <div className="lp-body">
        <span className="muted">
          {unlocked
            ? free === 1
              ? t('1 free attempt left')
              : t('{n} free attempts left', { n: free })
            : t('Clear floor {n} to unlock', { n: DAILY.unlockHighestCleared })}
        </span>
        <button className={`btn ${paid ? 'gem' : 'primary'} sm`} onClick={enter} disabled={disabled}>
          {!unlocked ? t('🔒 Locked') : paid ? `${t('Enter')} · ${DAILY.extraAttemptGemCost} 💎` : t('⚔ Enter today’s run')}
        </button>
      </div>
      {last && (
        <div className="lp-result" style={{ color: last.cleared ? 'var(--good)' : 'var(--ink-faint)' }}>
          {last.text}
        </div>
      )}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

const SYN = TUNING.lobby.synthesis

/** A clickable hero chip used by the synthesis pickers. */
function HeroChip({
  hero,
  selected,
  onClick,
  label,
}: {
  hero: OwnedHero
  selected: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      className={`syn-chip ${selected ? 'sel' : ''}`}
      onClick={onClick}
      title={`${hero.name} · ${hero.star}★ · Sanity ${hero.sanity}`}
    >
      <Portrait hero={hero} size="sm" />
      <span className="syn-chip-name">{hero.name.split(/\s+/)[0]}</span>
      {label && <span className="muted"> {label}</span>}
    </button>
  )
}

/** The Synthesis Chamber — closed-door, ML-gated. Transfer or Salvage heroes. */
function SynthesisChamber({ state, store }: { state: GameState; store: Store }) {
  const [mode, setMode] = useState<'transfer' | 'salvage'>('salvage')
  const [survivorId, setSurvivorId] = useState<HeroId | null>(null)
  const [sacrificeIds, setSacrificeIds] = useState<HeroId[]>([])
  const [confirming, setConfirming] = useState(false)
  const [rescue, setRescue] = useState<RescueChoice | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const unlocked = synthesisUnlocked(state)
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)

  if (!unlocked) {
    return (
      <div className="lobby-portal synth-portal locked">
        <div className="lp-head">
          <span className="lp-glyph">🧪</span>
          <span className="lp-name">{t('Synthesis Chamber')}</span>
          <span className="muted">{t('— the door stays shut')}</span>
        </div>
        <div className="lr-blurb">{t('Unlocks at Master Lv {unlockMasterLevel}.', { unlockMasterLevel: SYN.unlockMasterLevel })}</div>
      </div>
    )
  }

  const reset = () => { setSacrificeIds([]); setSurvivorId(null); setConfirming(false); setRescue(null); setErr(null) }
  const toggleSac = (id: HeroId) => {
    setConfirming(false)
    setRescue(null)
    setSacrificeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }
  const chooseSurvivor = (id: HeroId) => {
    setConfirming(false)
    setRescue(null)
    setSurvivorId((cur) => (cur === id ? null : id))
    setSacrificeIds((cur) => cur.filter((x) => x !== id)) // a survivor can't also be a sacrifice
  }

  const chosen = mode === 'salvage' && survivorId !== null && rescue !== null ? rescue : undefined
  const input: SynthesisInput = { mode, survivorId, sacrificeIds, ...(chosen ? { rescue: chosen } : {}) }
  const valid = canSynthesize(state, input)
  const preview = valid ? synthesisPreview(state, input) : null
  const rescueChoices = mode === 'salvage' && survivorId !== null ? rescueOptions(state, survivorId, sacrificeIds) : []
  const rescueKey = (r: RescueChoice) => (r.kind === 'skill' ? `s:${r.skillId}` : `g:${r.attr}`)

  function run() {
    setErr(null)
    try {
      store.dispatch({ type: 'SYNTHESIZE', mode, survivorId, sacrificeIds, ...(chosen ? { rescue: chosen } : {}) }, Date.now())
      reset()
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : 'Synthesis failed'))
    }
  }

  const sacrificeable = living.filter((h) => h.id !== survivorId && h.promotion === null)

  return (
    <div className="lobby-portal synth-portal">
      <div className="lp-head">
        <span className="lp-glyph">🧪</span>
        <span className="lp-name">{t('Synthesis Chamber')}</span>
        <span className="muted">{t('— the Master can’t watch')}</span>
      </div>

      <div className="syn-modes">
        <button className={`btn sm ${mode === 'salvage' ? 'primary' : ''}`} onClick={() => { setMode('salvage'); setConfirming(false) }}>
          {t('♻ Salvage')}
        </button>
        <button className={`btn sm ${mode === 'transfer' ? 'primary' : ''}`} onClick={() => { setMode('transfer'); setConfirming(false) }}>
          {t('⇄ Transfer')}
        </button>
      </div>

      <div className="syn-section">
        <div className="syn-label">
          {mode === 'transfer' ? t('Survivor (required)') : t('Rescue onto (optional)')}
        </div>
        <div className="syn-row">
          {living.map((h) => (
            <HeroChip key={h.id} hero={h} selected={survivorId === h.id} onClick={() => chooseSurvivor(h.id)} />
          ))}
        </div>
      </div>

      <div className="syn-section">
        <div className="syn-label">{t('Sacrifices (permanently destroyed)')}</div>
        <div className="syn-row">
          {sacrificeable.map((h) => (
            <HeroChip key={h.id} hero={h} selected={sacrificeIds.includes(h.id)} onClick={() => toggleSac(h.id)} />
          ))}
        </div>
      </div>

      {rescueChoices.length > 0 && (
        <div className="syn-section">
          <div className="syn-label">{t('Rescue (optional — else the first missing skill, then the best grade)')}</div>
          <div className="syn-row">
            {rescueChoices.map((r) => {
              const key = rescueKey(r)
              const on = rescue !== null && rescueKey(rescue) === key
              return (
                <button key={key} type="button" className={`btn sm ${on ? 'primary' : ''}`} onClick={() => setRescue(on ? null : r)}>
                  {r.kind === 'skill' ? `✦ ${t(SKILLS[r.skillId]?.name ?? r.skillId)}` : `▲ ${t('{attr} grade', { attr: r.attr.toUpperCase() })}`}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {preview && (
        <div className="syn-preview">
          {mode === 'transfer' ? (
            <span>
              {Object.keys(preview.gradeDeltas).length > 0
                ? t('Grades') + ' ' + Object.entries(preview.gradeDeltas).map(([k, v]) => `${k} +${v}`).join(', ')
                : t('No grade gain')}
              {' · '}
              {preview.skillCopyOdds.length > 0
                ? t('copy odds') + ' ' +
                  preview.skillCopyOdds.map((o) => `${t(SKILLS[o.skillId]?.name ?? o.skillId)} ${Math.round(o.chance * 100)}%`).join(', ')
                : t('no skill to copy')}
            </span>
          ) : (
            <span>
              {t('Yields')} {Object.entries(preview.materialYield).map(([k, v]) => `${v} × ${matLabel(k)}`).join(', ') || '—'}
              {preview.rescue ? ` · ${t('rescue')} ${t(preview.rescue)}` : ''}
            </span>
          )}
          <span className="muted">
            {' · '}
            {t('−{a} survivor / −{b} witness Sanity', { a: preview.survivorSanityCost, b: preview.witnessSanityCost })}
          </span>
        </div>
      )}

      <div className="syn-actions">
        {!confirming ? (
          <button className="btn sm" disabled={!valid} onClick={() => setConfirming(true)}>
            {mode === 'transfer' ? t('⇄ Synthesize') : t('♻ Render')}
          </button>
        ) : (
          <>
            <button className="btn sm syn-destroy" onClick={run}>
              Permanently destroy {sacrificeIds.length} hero{sacrificeIds.length === 1 ? '' : 'es'}
            </button>
            <button className="btn sm" onClick={() => setConfirming(false)}>{t('Cancel')}</button>
          </>
        )}
      </div>
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

const EQUIP = TUNING.lobby.equipment
/** Forged item names come from the engine in English ("S Blade", "Aria's Oath-Blade"). */
function itemLabel(name: string): string {
  const oath = /^(.+)'s Oath-(\w+)$/.exec(name)
  if (oath) return t("{who}'s Oath-{noun}", { who: oath[1]!, noun: t(oath[2]!) })
  const plain = /^(\S+) (Blade|Plate|Charm)$/.exec(name)
  if (plain) return t('{grade} {noun}', { grade: plain[1]!, noun: t(plain[2]!) })
  return t(name)
}
const EQUIP_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'accessory']
const SLOT_GLYPH: Record<EquipmentSlot, string> = { weapon: '⚔', armor: '🛡', accessory: '💍' }

/** The Armory — the ML-gated Smithy forge plus per-hero equip/unequip (Layer 1 §5). */
function Armory({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)
  const [anvil, setAnvil] = useState<EquipmentItem | null>(null)
  const [forged, setForged] = useState<string | null>(null)

  function strike(item: EquipmentItem, performance: number | undefined) {
    setAnvil(null)
    setErr(null)
    try {
      const r = upgradeEquipmentWithResult(store.getState(), item.id, performance, Date.now())
      store.dispatch({ type: 'UPGRADE_EQUIPMENT', itemId: item.id, performance }, Date.now())
      setForged(
        r.success
          ? t('The hammer rings true — {item} rose a grade!', { item: itemLabel(item.name) })
          : t('The metal cracks. {item} holds, but the materials are spent.', { item: itemLabel(item.name) }),
      )
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'The forge failed'))
    }
  }

  if (!smithyUnlocked(state)) {
    return (
      <div className="lobby-portal armory-portal locked">
        <div className="lp-head">
          <span className="lp-glyph">🛠</span>
          <span className="lp-name">{t('Armory')}</span>
          <span className="muted">{t('— the forge is cold')}</span>
        </div>
        <div className="lr-blurb">{t('Unlocks at Master Lv {unlockMasterLevel}.', { unlockMasterLevel: EQUIP.unlockMasterLevel })}</div>
      </div>
    )
  }

  const grade = forgeGrade(state.meta.masterLevel)
  const cost = forgeCost(grade)
  const affordable = canCraft(state)
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const equipped = equippedItemIds(state)
  const freeItems = state.inventory.filter((i) => !equipped.has(i.id))

  const run = (cmd: Command, fail: string) => {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message : fail))
    }
  }

  return (
    <div className="lobby-portal armory-portal">
      <div className="lp-head">
        <span className="lp-glyph">🛠</span>
        <span className="lp-name">{t('Armory')}</span>
        <span className="muted">{t('— forge & equip')}</span>
      </div>

      {/* Forge — one button per slot, each forging the best grade the Master Level allows. */}
      <div className="syn-section">
        <div className="syn-label">
          Forge · grade {grade} · ◆ {cost.gold.toLocaleString()} + {cost.promotionStone} stone{cost.promotionStone === 1 ? '' : 's'}
        </div>
        <div className="syn-modes">
          {EQUIP_SLOTS.map((slot) => (
            <button
              key={slot}
              className="btn sm"
              disabled={!affordable}
              onClick={() => run({ type: 'CRAFT_EQUIPMENT', slot }, 'Forge failed')}
              title={`Forge a ${itemName(slot, grade)}`}
            >
              {SLOT_GLYPH[slot]} {itemName(slot, grade)}
            </button>
          ))}
        </div>
        {!affordable && <div className="lr-action-note muted">{t('Not enough gold or Promotion Stones to forge.')}</div>}
      </div>

      {/* Forged items not currently worn by anyone. */}
      <div className="syn-section">
        <div className="syn-label">Forged &amp; free ({freeItems.length})</div>
        <div className="syn-row">
          {freeItems.length === 0 ? (
            <span className="lr-empty">{t('Nothing forged yet.')}</span>
          ) : (
            freeItems.map((it) => (
              <span
                key={it.id}
                className={`arm-item ${it.exclusiveTo ? 'bound' : ''}`}
                title={`${itemLabel(it.name)} · ${t(it.slot)}${it.exclusiveTo ? ` · ${t('bound to {name}', { name: state.heroes[it.exclusiveTo]?.name ?? t('its hero') })}` : ''}`}
              >
                {SLOT_GLYPH[it.slot]} {itemLabel(it.name)}
                {it.exclusiveTo && ' 🔗'}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Blacksmithing (Layer 3 §C2): raise an item's grade at the anvil. */}
      <div className="syn-section">
        <div className="syn-label">{t('Anvil · raise a grade (failure keeps the item)')}</div>
        <div className="drill-list">
          {state.inventory.map((it) => {
            const cost = forgeUpgradeCost(it)
            const why = upgradeRefusal(state, it.id)
            return (
              <div key={it.id} className={`drill-row ${why ? 'off' : ''}`} title={why ? t(why) : undefined}>
                <span className="skill-grade">{it.grade}</span>
                <span className="drill-name">
                  {SLOT_GLYPH[it.slot]} {itemLabel(it.name)}
                  {cost && ` · ${Math.round(upgradeOdds(it.grade, state.meta.skill.blacksmith) * 100)}%`}
                </span>
                <span className="muted">{cost ? `${cost.gold.toLocaleString()} ◆ + ${cost.promotionStone} 🪨` : t('max')}</span>
                <button className="btn sm" disabled={why !== null} onClick={() => setAnvil(it)}>
                  {t('⚒ Forge')}
                </button>
              </div>
            )
          })}
          {state.inventory.length === 0 && <span className="lr-empty">{t('Nothing to refine yet.')}</span>}
        </div>
        {forged && <div className="lr-action-note">{forged}</div>}
      </div>
      {anvil && (
        <TimingGame
          title={t('Blacksmithing')}
          verb={t('Strike')}
          skill={state.meta.skill.blacksmith}
          hint={t('Strike when the marker crosses the glowing centre. Base odds {n}%.', { n: Math.round(upgradeOdds(anvil.grade, 0.5) * 100) })}
          onDone={(p) => strike(anvil, p)}
          onCancel={() => setAnvil(null)}
        />
      )}

      {/* Per-hero loadout — one control per slot: unequip what's worn, else equip the first free fit. */}
      <div className="syn-section">
        <div className="syn-label">{t('Loadouts')}</div>
        {living.map((h) => (
          <div key={h.id} className="arm-hero">
            <span className="arm-hero-name">{h.name.split(/\s+/)[0]}</span>
            {EQUIP_SLOTS.map((slot) => {
              const wornId = h.equipment[slot]
              const worn = wornId ? state.inventory.find((i) => i.id === wornId) ?? null : null
              const candidate =
                freeItems.find((i) => i.slot === slot && (i.exclusiveTo === undefined || i.exclusiveTo === h.id)) ?? null
              if (worn) {
                return (
                  <button
                    key={slot}
                    className="btn sm arm-slot"
                    onClick={() => run({ type: 'UNEQUIP_ITEM', heroId: h.id, slot }, 'Unequip failed')}
                    title={t('Unequip {item}', { item: itemLabel(worn.name) })}
                  >
                    {SLOT_GLYPH[slot]} {itemLabel(worn.name)} ✕
                  </button>
                )
              }
              if (candidate) {
                return (
                  <button
                    key={slot}
                    className="btn sm arm-slot"
                    onClick={() => run({ type: 'EQUIP_ITEM', heroId: h.id, itemId: candidate.id }, 'Equip failed')}
                    title={t('Equip {item}', { item: itemLabel(candidate.name) })}
                  >
                    {SLOT_GLYPH[slot]} + {itemLabel(candidate.name)}
                  </button>
                )
              }
              return (
                <span key={slot} className="arm-slot muted">
                  {SLOT_GLYPH[slot]} —
                </span>
              )
            })}
          </div>
        ))}
      </div>

      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

const TRAIN = TUNING.skills.training

/** The Training Center: drills in progress + a hero → skill drill picker. */
function TrainingAction({ state, store }: { state: GameState; store: Store }) {
  const [heroId, setHeroId] = useState<HeroId | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const level = state.facilities.trainingCenter.level
  const ceiling = maxTrainableGrade(level)
  const nowWorld = toWorldTime(Date.now())
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const drilling = living.filter((h) => h.training !== null)
  const free = living.filter((h) => h.training === null && h.promotion === null)
  const selected = heroId && state.heroes[heroId] && free.some((h) => h.id === heroId) ? state.heroes[heroId]! : null

  function run(cmd: Command) {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Action failed'))
    }
  }

  if (ceiling === null) {
    return <div className="lr-action-note">{t('Build the Training Center to start drills.')}</div>
  }

  return (
    <div className="lr-action training-action">
      <div className="ta-row"><span>{t('Max trainable grade')}</span><span className="ta-val">{ceiling}</span></div>
      <div className="ta-row"><span>{t('Skill XP per drill')}</span><span className="ta-val">+{drillXp(level)}</span></div>
      <div className="ta-row"><span>{t('Drill length')}</span><span className="ta-val">{t('{n} world-min', { n: Math.round(TRAIN.drillDurationMs / 60_000) })}</span></div>

      {drilling.length > 0 && (
        <>
          <h4 className="panel-sub">{t('In the yard')}</h4>
          {drilling.map((h) => (
            <div key={h.id} className="promo-row">
              <span className="promo-name">
                {h.name.split(/\s+/)[0]} · {h.training!.mode === 'learn' ? t('learning') : t('refining')} {t(SKILLS[h.training!.skillId]?.name ?? '')}
              </span>
              <span className="muted">{timeLeft(h.training!.completesAtWorld - nowWorld)}</span>
              <button
                className="btn gem sm"
                onClick={() => run({ type: 'SKIP_TIMER', kind: 'training', id: h.id })}
                disabled={state.gems < TRAIN.skipGemCost}
                title={t('Finish now for {n} gems', { n: TRAIN.skipGemCost })}
              >
                ⏩ {TRAIN.skipGemCost} ♦
              </button>
            </div>
          ))}
        </>
      )}

      <h4 className="panel-sub">{t('New drill')}</h4>
      {free.length === 0 ? (
        <div className="lr-empty">{t('Every hero is busy.')}</div>
      ) : (
        <div className="syn-row">
          {free.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`syn-chip ${selected?.id === h.id ? 'sel' : ''}`}
              onClick={() => setHeroId(selected?.id === h.id ? null : h.id)}
            >
              <Portrait hero={h} size="sm" />
              <span className="syn-chip-name">{h.name.split(/\s+/)[0]}</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="drill-list">
          <SkillList hero={selected} />
          {trainingOptions(state, selected.id).map((o) => {
            const def = SKILLS[o.skillId]!
            return (
              <div key={o.skillId} className={`drill-row ${o.ok ? '' : 'off'}`} title={o.reason ? t(o.reason) : undefined}>
                <span className="skill-grade">{def.grade}</span>
                <span className="drill-name">
                  {o.mode === 'learn' ? t('Learn') : t('Refine')} {t(def.name)}
                </span>
                <span className="muted">{o.cost.toLocaleString()} ◆</span>
                <button
                  className="btn sm"
                  disabled={!o.ok}
                  onClick={() => run({ type: 'TRAIN_SKILL', heroId: selected.id, skillId: o.skillId })}
                >
                  {t('Train')}
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

const TRANSFER = TUNING.skills.transfer

/** The Transfer Station: move a skill between heroes, or fuse/evolve skills early. */
function TransferAction({ state, store }: { state: GameState; store: Store }) {
  const [tab, setTab] = useState<'transfer' | 'fuse'>('transfer')
  const [donorId, setDonorId] = useState<HeroId | null>(null)
  const [recipientId, setRecipientId] = useState<HeroId | null>(null)
  const [fuserId, setFuserId] = useState<HeroId | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const level = state.facilities.transferStation.level
  const ceiling = maxTransferGrade(level)
  const free = (Object.values(state.heroes) as OwnedHero[]).filter(
    (h) => h.alive && h.promotion === null && h.training === null,
  )
  const donor = donorId ? free.find((h) => h.id === donorId) ?? null : null
  const recipient = recipientId ? free.find((h) => h.id === recipientId) ?? null : null
  const fuser = fuserId ? free.find((h) => h.id === fuserId) ?? null : null

  function run(cmd: Command) {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Action failed'))
    }
  }

  if (ceiling === null) {
    return <div className="lr-action-note">{t('Build the Transfer Station to move and fuse skills.')}</div>
  }

  const chips = (selected: OwnedHero | null, pick: (id: HeroId | null) => void, exclude?: HeroId | null) => (
    <div className="syn-row">
      {free
        .filter((h) => h.id !== exclude)
        .map((h) => (
          <HeroChip key={h.id} hero={h} selected={selected?.id === h.id} onClick={() => pick(selected?.id === h.id ? null : h.id)} />
        ))}
    </div>
  )

  return (
    <div className="lr-action transfer-action">
      <div className="ta-row"><span>{t('Max transferable grade')}</span><span className="ta-val">{ceiling}</span></div>
      <div className="ta-row">
        <span>{t('A moved skill arrives at')}</span>
        <span className="ta-val">{level >= TRANSFER.keepLevelAt ? t('its full level') : t('one level lower')}</span>
      </div>
      <div className="syn-modes">
        <button className={`btn sm ${tab === 'transfer' ? 'primary' : ''}`} onClick={() => setTab('transfer')}>{t('⇄ Transfer')}</button>
        <button className={`btn sm ${tab === 'fuse' ? 'primary' : ''}`} onClick={() => setTab('fuse')}>{t('✦ Fuse & evolve')}</button>
      </div>

      {tab === 'transfer' ? (
        <>
          <div className="syn-label">{t('Donor (forgets the skill)')}</div>
          {chips(donor, (id) => { setDonorId(id); setErr(null) }, recipientId)}
          <div className="syn-label">{t('Recipient')}</div>
          {chips(recipient, (id) => { setRecipientId(id); setErr(null) }, donorId)}
          {donor && recipient && (
            <div className="drill-list">
              {donor.skills.map((sk) => {
                const def = SKILLS[sk.id]
                if (!def) return null
                const reason = transferRefusal(state, donor.id, recipient.id, sk.id)
                return (
                  <div key={sk.id} className={`drill-row ${reason ? 'off' : ''}`} title={reason ? t(reason) : undefined}>
                    <span className="skill-grade">{def.grade}</span>
                    <span className="drill-name">
                      {t('{name} Lv{level} → Lv{n}', { name: t(def.name), level: sk.level, n: transferredLevel(sk.level, level) })}
                    </span>
                    <span className="muted">{transferCost(sk.id).toLocaleString()} ◆</span>
                    <button
                      className="btn sm"
                      disabled={reason !== null}
                      onClick={() => run({ type: 'TRANSFER_SKILL', donorId: donor.id, recipientId: recipient.id, skillId: sk.id })}
                    >
                      {t('Move')}
                    </button>
                  </div>
                )
              })}
              {donor.skills.length === 0 && <div className="lr-empty">{t('The donor has no skills.')}</div>}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="syn-label">{t('Hero')}</div>
          {chips(fuser, (id) => { setFuserId(id); setErr(null) })}
          {fuser && (
            <div className="drill-list">
              <SkillList hero={fuser} />
              {fuseOptions(state, fuser.id).map((o) => {
                const def = SKILLS[o.result]!
                return (
                  <div key={o.result} className={`drill-row ${o.ok ? '' : 'off'}`} title={o.reason ? t(o.reason) : undefined}>
                    <span className="skill-grade">{def.grade}</span>
                    <span className="drill-name">
                      {o.kind === 'evolve' ? t('Evolve') : t('Fuse')} {o.inputs.map((i) => t(SKILLS[i]?.name ?? i)).join(' + ')} → {t(def.name)}
                    </span>
                    <span className="muted">{o.cost.toLocaleString()} ◆</span>
                    <button className="btn sm" disabled={!o.ok} onClick={() => run({ type: 'FUSE_SKILL', heroId: fuser.id, result: o.result })}>
                      {o.kind === 'evolve' ? t('Evolve') : t('Fuse')}
                    </button>
                  </div>
                )
              })}
              {fuseOptions(state, fuser.id).length === 0 && <div className="lr-empty">{t('No recipe uses this hero’s skills yet.')}</div>}
            </div>
          )}
        </>
      )}
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

export type PanelPlace =
  | 'kitchen'
  | 'tacticalCenter'
  | 'promotionChamber'
  | 'trainingCenter'
  | 'transferStation'
  | 'synthesis'
  | 'armory'
  | 'daily'
  | 'shop'
  | 'hallOfMagic'
  | 'rift'
  | 'guild'
  | 'dormitory'
  | 'tavern'
  | 'infirmary'
  | 'garden'
  | 'memorial'
  | 'library'
  | 'watchtower'
  | 'market'

const BLURB: Record<PanelPlace, string> = {
  kitchen: 'A warm hearth and a long table. Heroes with frayed nerves come here to recover.',
  tacticalCenter: 'Maps, pins and the party board. Focus & overlook combat levers.',
  promotionChamber: 'A sealed marble chamber. Heroes at their star cap are raised past it here.',
  trainingCenter: 'Sand, straw dummies and a chalk drill board. Training sharpens skills — never stats or level.',
  transferStation: 'Twin crystal plinths hum in the dark. A skill can leave one hero and settle in another here.',
  synthesis: 'The vats bubble. Heroes who enter do not come out whole.',
  armory: 'The Smithy forge and the equipment racks.',
  daily: "A rift that opens onto a different dungeon each world-day.",
  shop: "Isel's counter. Bright banners, limited offers, a smile that never reaches her eyes.",
  hallOfMagic: 'Brass orreries turn slowly. The world’s Probability Interference is measured — and strengthened — here.',
  rift: 'The air itself is cracked here. Beyond it: the Ruins, and other Masters’ worlds.',
  guild: 'A tall standard and a notice board. Other Masters’ names, other Masters’ wars.',
  dormitory: 'Rows of narrow beds. Every hero who has one sleeps better; the rest make do on the hall floor.',
  tavern: 'Low beams, a long bar and too few chairs. Where heroes become friends — and rivals.',
  infirmary: 'Clean white cots. Broken nerves and heavy grief mend faster under a healer’s care.',
  garden: 'Neat rows in dark soil. Produce for the kitchen and a little gold at market.',
  memorial: 'A quiet lawn behind a hedge, an obelisk with an eternal flame, and a grave for every hero who fell.',
  library: 'Shelves of books no one remembers writing. Scholars study the floors ahead here.',
  watchtower: 'A stone tower over the Crack of Time. Guards here see invaders coming.',
  market: 'Stalls under striped awnings. Merchants trade the lobby’s surplus with other worlds.',
}

/** The body of a facility window: rules UI for one place in the lobby. */
export function PlacePanel({
  place,
  state,
  store,
  onProfile,
}: {
  place: PanelPlace
  state: GameState
  store: Store
  onFindHero?: (id: string) => void
  onProfile?: (id: string) => void
}) {
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const partyIds = new Set(state.party.slots.filter(Boolean) as string[])
  const here = (room: 'promotionChamber' | 'tacticalCenter') => living.filter((h) => roomFor(h, partyIds) === room)
  const lifeFacility: FacilityId | null =
    place === 'dormitory' ||
    place === 'tavern' ||
    place === 'infirmary' ||
    place === 'garden' ||
    place === 'memorial' ||
    place === 'library' ||
    place === 'watchtower' ||
    place === 'market'
      ? place
      : place === 'armory'
        ? 'forge'
        : null

  return (
    <div className={`place-panel place-${place}`}>
      <p className="place-blurb">{t(BLURB[place])}</p>
      {(place === 'kitchen' ||
        place === 'tacticalCenter' ||
        place === 'promotionChamber' ||
        place === 'trainingCenter' ||
        place === 'transferStation' ||
        place === 'hallOfMagic' ||
        lifeFacility !== null) && (
        <div className="lr-lvl-row">
          <span className="lr-lvl">
            {state.facilities[lifeFacility ?? (place as FacilityId)].level === 0
              ? t('Not built')
              : t('Facility Lv {n}', { n: state.facilities[lifeFacility ?? (place as FacilityId)].level })}
          </span>
        </div>
      )}
      {place === 'kitchen' && (
        <>
          <BanquetAction state={state} store={store} />
          <KitchenPantry state={state} />
          <UpgradeControl state={state} store={store} facility="kitchen" />
          <StaffSection state={state} store={store} job="cook" onProfile={onProfile} />
          <h4 className="panel-sub">{t('Here now')}</h4>
          <HereNow state={state} place="kitchen" onProfile={onProfile} />
        </>
      )}
      {place === 'tacticalCenter' && (
        <>
          <TacticalAction state={state} />
          <UpgradeControl state={state} store={store} facility="tacticalCenter" />
          <h4 className="panel-sub">{t('On duty')}</h4>
          <Occupants heroes={here('tacticalCenter')} empty="No party assigned — use the party board." />
        </>
      )}
      {place === 'promotionChamber' && (
        <>
          <PromotionAction state={state} store={store} />
          <UpgradeControl state={state} store={store} facility="promotionChamber" />
          <h4 className="panel-sub">{t('Waiting at the cap')}</h4>
          <Occupants heroes={here('promotionChamber')} empty="No one is waiting here." />
        </>
      )}
      {place === 'trainingCenter' && (
        <>
          <TrainingAction state={state} store={store} />
          <UpgradeControl state={state} store={store} facility="trainingCenter" />
          <StaffSection state={state} store={store} job="instructor" onProfile={onProfile} />
          <h4 className="panel-sub">{t('In the yard now')}</h4>
          <HereNow state={state} place="yard" onProfile={onProfile} />
        </>
      )}
      {place === 'transferStation' && (
        <>
          <TransferAction state={state} store={store} />
          <UpgradeControl state={state} store={store} facility="transferStation" />
        </>
      )}
      {place === 'hallOfMagic' && (
        <>
          <HallOfMagicInfo state={state} />
          <UpgradeControl state={state} store={store} facility="hallOfMagic" />
        </>
      )}
      {place === 'rift' && <RiftPanel state={state} store={store} />}
      {place === 'rift' && state.meta.crackOpen && <WeeklyTrialLauncher state={state} store={store} />}
      {place === 'shop' && <ShopPanel state={state} store={store} />}
      {place === 'guild' && <GuildPanel state={state} store={store} />}
      {place === 'synthesis' && <SynthesisChamber state={state} store={store} />}
      {place === 'armory' && (
        <>
          <Armory state={state} store={store} />
          <ForgeOrderSection state={state} store={store} />
          <UpgradeControl state={state} store={store} facility="forge" />
          <StaffSection state={state} store={store} job="blacksmith" onProfile={onProfile} />
        </>
      )}
      {place === 'dormitory' && (
        <>
          <DormitoryInfo state={state} />
          <UpgradeControl state={state} store={store} facility="dormitory" />
          <h4 className="panel-sub">{t('Here now')}</h4>
          <HereNow state={state} place="dormitory" onProfile={onProfile} />
        </>
      )}
      {place === 'tavern' && (
        <>
          <UpgradeControl state={state} store={store} facility="tavern" />
          <h4 className="panel-sub">{t('Here now')}</h4>
          <HereNow state={state} place="tavern" onProfile={onProfile} empty="The bar is empty. For now." />
        </>
      )}
      {place === 'infirmary' && (
        <>
          <UpgradeControl state={state} store={store} facility="infirmary" />
          <StaffSection state={state} store={store} job="healer" onProfile={onProfile} />
          <h4 className="panel-sub">{t('Resting here')}</h4>
          <HereNow state={state} place="infirmary" onProfile={onProfile} />
        </>
      )}
      {place === 'garden' && (
        <>
          <UpgradeControl state={state} store={store} facility="garden" />
          <StaffSection state={state} store={store} job="gardener" onProfile={onProfile} />
          <HereNow state={state} place="garden" onProfile={onProfile} />
        </>
      )}
      {place === 'library' && (
        <>
          <LibraryInfo state={state} />
          <UpgradeControl state={state} store={store} facility="library" />
          <StaffSection state={state} store={store} job="scholar" onProfile={onProfile} />
          <HereNow state={state} place="library" onProfile={onProfile} />
        </>
      )}
      {place === 'watchtower' && (
        <>
          <WatchtowerInfo state={state} />
          <UpgradeControl state={state} store={store} facility="watchtower" />
          <StaffSection state={state} store={store} job="guard" onProfile={onProfile} />
        </>
      )}
      {place === 'market' && (
        <>
          <UpgradeControl state={state} store={store} facility="market" />
          <StaffSection state={state} store={store} job="merchant" onProfile={onProfile} />
          <HereNow state={state} place="market" onProfile={onProfile} />
        </>
      )}
      {place === 'memorial' && (
        <>
          <UpgradeControl state={state} store={store} facility="memorial" />
          <h4 className="panel-sub">{t('Visiting now')}</h4>
          <HereNow state={state} place="memorial" onProfile={onProfile} empty="No one is visiting." />
          <MemorialPanel state={state} />
        </>
      )}
      {place === 'daily' && <DailyPortal state={state} store={store} />}
    </div>
  )
}
