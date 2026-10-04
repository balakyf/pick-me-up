import { useState } from 'react'
import type { EquipmentGrade, EquipmentItem, EquipmentSlot, GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { bestLoadout, boundElsewhere, canCraft, forgeCost, forgeGrade, itemDelta, itemName, smithyUnlocked, wearerOf, wieldable } from '../../engine/equipment'
import { upgradeCost as forgeUpgradeCost, upgradeOdds, upgradeRefusal } from '../../engine/minigames'
import { upgradeEquipmentWithResult } from '../../engine/store'
import { TimingGame } from '../metaPanels'
import { t } from '../i18n/i18n'
import { fmtInt, ta, tn } from '../text'
import { HeroPicker } from '../hero/HeroPicker'
import { GearPanel, ItemTags, itemStatLine } from '../hero/GearPanel'
import { shortName } from '../life/speech'
import { GEAR_ALL, GRADE_ORDER, gearRows, gradeCounts, type GearFilter } from './armoryModel'
import { EQUIP_SLOTS, SLOT_GLYPH, SLOT_NAME, deltaText, itemLabel } from './gearText'

// Re-exported for the summon reveal (lane J) and older imports.
export { itemLabel, EQUIP_SLOTS, SLOT_GLYPH } from './gearText'

const EQUIP = TUNING.lobby.equipment

/**
 * The Armory (lane N): the ML-gated Smithy forge, the inventory as a grid (slot, grade and
 * who-has-it filters; heirlooms of the fallen marked with who carried them), a side-by-side
 * compare of any item against what a hero wears, one hero's loadout (the shared hero
 * picker, then the hero sheet's GearPanel with "equip best"), equip-best for the whole
 * party, and the anvil. The forge's work order is ForgeOrders, beside it.
 */
export function Armory({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [anvil, setAnvil] = useState<EquipmentItem | null>(null)
  const [forged, setForged] = useState<string | null>(null)
  const [filter, setFilter] = useState<GearFilter>(GEAR_ALL)
  const [picked, setPicked] = useState<string | null>(null)
  const [heroId, setHeroId] = useState<HeroId | null>(null)

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
  const rows = gearRows(state, filter)
  const counts = gradeCounts(state)
  const item = picked ? state.inventory.find((i) => i.id === picked) ?? null : null
  const hero = heroId && state.heroes[heroId]?.alive ? state.heroes[heroId]! : null
  const party = state.party.slots.flatMap((id) => (id && state.heroes[id]?.alive ? [state.heroes[id]!] : []))
  const partyPlans = party.filter((h) => bestLoadout(state, h.id).length > 0)

  const run = (cmd: Parameters<Store['dispatch']>[0], fail: string): boolean => {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
      return true
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : fail))
      return false
    }
  }

  function equipParty() {
    setNote(null)
    let n = 0
    // Strongest first: the board's order is the Master's, so walk it as it stands.
    for (const h of party) {
      const now = store.getState()
      if (now && bestLoadout(now, h.id).length > 0 && run({ type: 'EQUIP_BEST', heroId: h.id }, 'Equip failed')) n++
    }
    setNote(tn(n, 'Equipped the best free gear on 1 hero.', 'Equipped the best free gear on {n} heroes.'))
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
          {tn(cost.promotionStone, 'Forge · grade {grade} · ◆ {gold} + 1 stone', 'Forge · grade {grade} · ◆ {gold} + {n} stones', { grade, gold: fmtInt(cost.gold) })}
        </div>
        <div className="syn-modes">
          {EQUIP_SLOTS.map((slot) => (
            <button
              key={slot}
              className="btn sm"
              disabled={!affordable}
              onClick={() => run({ type: 'CRAFT_EQUIPMENT', slot }, 'Forge failed')}
              title={ta('Forge a {item}', { item: itemLabel(itemName(slot, grade)) })}
            >
              {SLOT_GLYPH[slot]} {itemLabel(itemName(slot, grade))}
            </button>
          ))}
        </div>
        {!affordable && <div className="lr-action-note muted">{t('Not enough gold or Promotion Stones to forge.')}</div>}
      </div>

      {/* The party, in one click. */}
      <div className="syn-section">
        <div className="syn-label">{t('The party')}</div>
        <div className="gear-best">
          <button type="button" className="btn sm primary" disabled={partyPlans.length === 0} onClick={equipParty}>
            ✦ {t('Equip best for the party')}
          </button>
          <span className="muted small">
            {party.length === 0
              ? t('No one is on the Party Board.')
              : partyPlans.length === 0
                ? t('The party already wears the best free gear.')
                : t('Better gear is free for {names}.', { names: partyPlans.map((h) => shortName(state, h.id)).join(', ') })}
          </span>
        </div>
        {note && <div className="lr-action-note">✓ {note}</div>}
      </div>

      {/* The inventory grid. */}
      <div className="syn-section">
        <div className="syn-label">{t('Inventory ({n})', { n: state.inventory.length })}</div>
        <div className="arm-filters" role="group" aria-label={t('Filter the inventory')}>
          <select className="pinput" aria-label={t('Slot')} value={filter.slot} onChange={(e) => setFilter({ ...filter, slot: e.target.value as EquipmentSlot | 'all' })}>
            <option value="all">{t('Every slot')}</option>
            {EQUIP_SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_GLYPH[s]} {t(SLOT_NAME[s])}
              </option>
            ))}
          </select>
          <select className="pinput" aria-label={t('Grade')} value={filter.grade} onChange={(e) => setFilter({ ...filter, grade: e.target.value as EquipmentGrade | 'all' })}>
            <option value="all">{t('Every grade')}</option>
            {GRADE_ORDER.filter((g) => counts[g]).map((g) => (
              <option key={g} value={g}>
                {t('Grade {g} ({n})', { g, n: counts[g]! })}
              </option>
            ))}
          </select>
          <select className="pinput" aria-label={t('Show')} value={filter.show} onChange={(e) => setFilter({ ...filter, show: e.target.value as GearFilter['show'] })}>
            <option value="all">{t('Worn and free')}</option>
            <option value="free">{t('Free only')}</option>
            <option value="worn">{t('Worn only')}</option>
            <option value="heirloom">{t('Left by the fallen')}</option>
          </select>
        </div>
        {rows.length === 0 ? (
          <span className="lr-empty">{state.inventory.length === 0 ? t('Nothing forged yet.') : t('No item matches these filters.')}</span>
        ) : (
          <div className="arm-grid" role="list" aria-label={t('Inventory')}>
            {rows.map((r) => (
              <button
                key={r.item.id}
                type="button"
                role="listitem"
                className={`arm-cell ${picked === r.item.id ? 'sel' : ''} ${r.wearer ? 'worn' : ''}`}
                onClick={() => setPicked(picked === r.item.id ? null : r.item.id)}
                aria-pressed={picked === r.item.id}
              >
                <span className="gear-name">
                  <span className={`gear-grade g-${r.item.grade}`}>{r.item.grade}</span> {SLOT_GLYPH[r.item.slot]} {itemLabel(r.item.name)}
                </span>
                <span className="muted small">{itemStatLine(r.item)}</span>
                <span className="arm-who">
                  {r.wearer ? t('worn by {name}', { name: shortName(state, r.wearer.id) }) : t('free')}
                  <ItemTags state={state} item={r.item} />
                </span>
              </button>
            ))}
          </div>
        )}
        {item && <SideBySide state={state} item={item} hero={hero} onEquip={(h) => run({ type: 'EQUIP_ITEM', heroId: h.id, itemId: item.id }, 'Equip failed')} />}
      </div>

      {/* One hero's loadout. */}
      <div className="syn-section">
        <div className="syn-label">{t('Outfit a hero')}</div>
        <HeroPicker
          state={state}
          label={t('Heroes to outfit')}
          selected={hero ? [hero.id] : []}
          onPick={(id) => setHeroId(heroId === id ? null : id)}
          note={(h) => (bestLoadout(state, h.id).length > 0 ? t('better gear free') : null)}
        />
        {hero && (
          <div className="arm-loadout">
            <h4 className="panel-sub">{t('{name}’s gear', { name: shortName(state, hero.id) })}</h4>
            <GearPanel state={state} store={store} hero={hero} />
          </div>
        )}
      </div>

      {/* Blacksmithing (Layer 3 §C2): raise an item's grade at the anvil. */}
      <details className="syn-section hs-more">
        <summary className="syn-label">{t('Anvil · raise a grade (failure keeps the item)')}</summary>
        <div className="drill-list">
          {state.inventory.map((it) => {
            const c = forgeUpgradeCost(it)
            const why = upgradeRefusal(state, it.id)
            return (
              <div key={it.id} className={`drill-row ${why ? 'off' : ''}`} title={why ? t(why) : undefined}>
                <span className="skill-grade">{it.grade}</span>
                <span className="drill-name">
                  {SLOT_GLYPH[it.slot]} {itemLabel(it.name)}
                  {c && ` · ${Math.round(upgradeOdds(it.grade, state.meta.skill.blacksmith) * 100)}%`}
                </span>
                <span className="muted">{c ? `${c.gold.toLocaleString()} ◆ + ${c.promotionStone} 🪨` : t('max')}</span>
                <button className="btn sm" disabled={why !== null} onClick={() => setAnvil(it)}>
                  {t('⚒ Forge')}
                </button>
              </div>
            )
          })}
          {state.inventory.length === 0 && <span className="lr-empty">{t('Nothing to refine yet.')}</span>}
        </div>
        {forged && <div className="lr-action-note">{forged}</div>}
      </details>
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

      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

/** The picked item beside what the hero being outfitted wears in that slot, with the deltas. */
function SideBySide({ state, item, hero, onEquip }: { state: GameState; item: EquipmentItem; hero: OwnedHero | null; onEquip: (h: OwnedHero) => void }) {
  if (!hero) return <div className="muted small arm-side-hint">{t('Choose a hero to outfit below to compare this item with what they wear.')}</div>
  const wornId = hero.equipment[item.slot]
  const worn = wornId ? state.inventory.find((i) => i.id === wornId) ?? null : null
  const d = itemDelta(worn, item)
  const ok = wieldable(state, item, hero.id) && wornId !== item.id
  const wearer = wearerOf(state, item.id)
  return (
    <div className="arm-side" aria-label={t('Compare')}>
      <div className="gear-slot">
        <span className="muted small">{t('{name} wears', { name: shortName(state, hero.id) })}</span>
        {worn ? (
          <>
            <span className="gear-name">
              <span className={`gear-grade g-${worn.grade}`}>{worn.grade}</span> {itemLabel(worn.name)}
            </span>
            <span className="muted small">{itemStatLine(worn)}</span>
          </>
        ) : (
          <span className="muted">{t('Empty')}</span>
        )}
      </div>
      <span className="arm-vs">→</span>
      <div className="gear-slot on">
        <span className="muted small">{t('This item')}</span>
        <span className="gear-name">
          <span className={`gear-grade g-${item.grade}`}>{item.grade}</span> {itemLabel(item.name)}
        </span>
        <span className="muted small">{itemStatLine(item)}</span>
        <ItemTags state={state} item={item} />
      </div>
      <div className="arm-side-deltas gear-best">
        <span className="gear-deltas">
          {d.stats.map((x) => (
            <span key={x.key} className={x.delta > 0 ? 'up' : 'down'}>
              {deltaText(x.key, x.delta)}
            </span>
          ))}
          <span className={`gear-cp ${d.cp > 0 ? 'up' : d.cp < 0 ? 'down' : ''}`}>
            {d.cp >= 0 ? '+' : '−'}
            {Math.abs(d.cp)} {t('CP')}
          </span>
        </span>
        <button type="button" className="pbtn sm" disabled={!ok} onClick={() => onEquip(hero)}>
          {wornId === item.id ? t('Already worn') : t('Equip on {name}', { name: shortName(state, hero.id) })}
        </button>
        {!ok && wornId !== item.id && (
          <span className="muted small">
            {boundElsewhere(state, item, hero.id)
              ? t('Bound to {name} for life', { name: state.heroes[item.exclusiveTo!]?.name ?? '' })
              : wearer
                ? t('{name} wears it', { name: wearer.name })
                : ''}
          </span>
        )}
      </div>
    </div>
  )
}
