import { useState } from 'react'
import type { GameState, OwnedHero, EquipmentSlot, Command, EquipmentItem } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { smithyUnlocked, forgeGrade, forgeCost, canCraft, itemName, equippedItemIds, wieldable } from '../../engine/equipment'
import { upgradeCost as forgeUpgradeCost, upgradeOdds, upgradeRefusal } from '../../engine/minigames'
import { upgradeEquipmentWithResult } from '../../engine/store'
import { TimingGame } from '../metaPanels'
import { t } from '../i18n/i18n'
import { HeroTag, pickerName } from '../hero/heroLabel'
import { fmtInt, ta, tn } from '../text'

const EQUIP = TUNING.lobby.equipment
/** Forged item names come from the engine in English ("S Blade", "Aria's Oath-Blade"). */
export function itemLabel(name: string): string {
  const oath = /^(.+)'s Oath-(\w+)$/.exec(name)
  if (oath) return t("{who}'s Oath-{noun}", { who: oath[1]!, noun: t(oath[2]!) })
  const plain = /^(\S+) (Blade|Plate|Charm)$/.exec(name)
  if (plain) return t('{grade} {noun}', { grade: plain[1]!, noun: t(plain[2]!) })
  return t(name)
}
export const EQUIP_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'accessory']
export const SLOT_GLYPH: Record<EquipmentSlot, string> = { weapon: '⚔', armor: '🛡', accessory: '💍' }

/** The Armory — the ML-gated Smithy forge plus per-hero equip/unequip (Layer 1 §5). */
export function Armory({ state, store }: { state: GameState; store: Store }) {
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

      {/* Forged items not currently worn by anyone. */}
      <div className="syn-section">
        <div className="syn-label">{t('Forged & free ({n})', { n: freeItems.length })}</div>
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
            <span className="arm-hero-name">
              {pickerName(state, h)} <HeroTag hero={h} />
            </span>
            {EQUIP_SLOTS.map((slot) => {
              const wornId = h.equipment[slot]
              const worn = wornId ? state.inventory.find((i) => i.id === wornId) ?? null : null
              const candidate =
                freeItems.find((i) => i.slot === slot && wieldable(state, i, h.id)) ?? null
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
