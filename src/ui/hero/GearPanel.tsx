/**
 * One hero's gear (lane N): the hero sheet's Gear tab and the Armory's loadout. Three slots
 * with what is worn (and who carried it before, if it came from the dead), a side-by-side
 * compare against every other item of a slot with the stat deltas, equip and unequip, and
 * one-click "equip best" (EQUIP_BEST, equipment/loadout).
 */
import { useState } from 'react'
import type { EquipmentItem, EquipmentSlot, GameState, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { bestLoadout, heirloomOf, itemStats, wearerOf, ITEM_STAT_KEYS } from '../../engine/equipment'
import { heroCp } from '../../engine/scout'
import { t } from '../i18n/i18n'
import { compareFor } from '../facilities/armoryModel'
import { EQUIP_SLOTS, SLOT_GLYPH, SLOT_NAME, deltaText, itemLabel, statText } from '../facilities/gearText'
import { shortName } from '../life/speech'

/** The little tags after an item: bound to its hero, carried by the fallen. */
export function ItemTags({ state, item }: { state: GameState; item: EquipmentItem }) {
  const grave = heirloomOf(state, item.id)
  const bound = item.exclusiveTo !== undefined ? state.heroes[item.exclusiveTo] : undefined
  // Worn by the hero it is bound to: the link alone says it (the wearer is named already).
  const own = bound !== undefined && bound.alive && wearerOf(state, item.id)?.id === bound.id
  return (
    <>
      {bound && (
        <span className="gear-tag bound" title={bound.alive ? t('Bound to {name} for life', { name: bound.name }) : t('Bound to {name}, who has fallen — it may be passed on', { name: bound.name })}>
          🔗{own ? '' : ` ${bound.alive ? shortName(state, bound.id) : `${bound.name.split(/\s+/)[0]} †`}`}
        </span>
      )}
      {grave && (
        <span className="gear-tag heirloom" title={t('Carried by {name} until they fell on floor {floor}', { name: grave.name, floor: grave.floor })}>
          ✝ {t('carried by {name}', { name: grave.name.split(/\s+/)[0]! })}
        </span>
      )}
    </>
  )
}

/** An item's stats as a short line ("12 P.ATK · 12 M.ATK"). */
export function itemStatLine(item: EquipmentItem): string {
  const s = itemStats(item)
  return ITEM_STAT_KEYS.filter((k) => s[k] !== 0)
    .map((k) => statText(k, s[k]))
    .join(' · ')
}

export function GearPanel({ state, store, hero }: { state: GameState; store: Store; hero: OwnedHero }) {
  const [slot, setSlot] = useState<EquipmentSlot | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const plan = bestLoadout(state, hero.id)
  const byId = new Map(state.inventory.map((i) => [i.id, i]))

  function run(cmd: Parameters<Store['dispatch']>[0], note?: string): boolean {
    setErr(null)
    setDone(null)
    try {
      store.dispatch(cmd, Date.now())
      if (note) setDone(note)
      return true
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
      return false
    }
  }

  if (!hero.alive) {
    return <div className="lr-empty">{t('The fallen carry nothing: their gear went back to the Armory.')}</div>
  }

  const rows = slot ? compareFor(state, hero, slot) : []
  const worn = slot && hero.equipment[slot] ? byId.get(hero.equipment[slot]!) ?? null : null

  return (
    <div className="gear-panel">
      <div className="gear-best">
        <button
          type="button"
          className="btn sm primary"
          disabled={plan.length === 0}
          onClick={() => {
            const before = heroCp(hero, state)
            if (!run({ type: 'EQUIP_BEST', heroId: hero.id })) return
            const after = store.getState()
            const h = after?.heroes[hero.id]
            if (after && h) setDone(t('Equipped the best free gear · CP {from} → {to}', { from: before.toLocaleString(), to: heroCp(h, after).toLocaleString() }))
          }}
          title={plan.length === 0 ? t('Nothing better is free in the Armory.') : undefined}
        >
          ✦ {t('Equip best')}
        </button>
        <span className="muted small">
          {plan.length === 0
            ? t('Nothing better is free in the Armory.')
            : plan
                .map((c) => `${SLOT_GLYPH[c.slot]} ${itemLabel(byId.get(c.to)?.name ?? '')}`)
                .join(' · ')}
        </span>
      </div>

      <div className="gear-slots">
        {EQUIP_SLOTS.map((s) => {
          const id = hero.equipment[s]
          const item = id ? byId.get(id) ?? null : null
          return (
            <div key={s} className={`gear-slot ${slot === s ? 'on' : ''}`}>
              <div className="gear-slot-head">
                <span className="gear-glyph" aria-hidden="true">
                  {SLOT_GLYPH[s]}
                </span>
                <span className="muted small">{t(SLOT_NAME[s])}</span>
              </div>
              {item ? (
                <>
                  <div className="gear-name">
                    <span className={`gear-grade g-${item.grade}`}>{item.grade}</span> {itemLabel(item.name)}
                  </div>
                  <div className="muted small">{itemStatLine(item)}</div>
                  <div>
                    <ItemTags state={state} item={item} />
                  </div>
                </>
              ) : (
                <div className="muted">{t('Empty')}</div>
              )}
              <div className="gear-slot-actions">
                <button type="button" className={`pbtn sm ${slot === s ? 'on' : ''}`} onClick={() => setSlot(slot === s ? null : s)} aria-expanded={slot === s}>
                  ⇄ {t('Compare')}
                </button>
                {item && (
                  <button type="button" className="pbtn sm ghost" onClick={() => run({ type: 'UNEQUIP_ITEM', heroId: hero.id, slot: s })} title={t('Unequip {item}', { item: itemLabel(item.name) })}>
                    ✕ {t('Unequip')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {slot && (
        <div className="gear-compare" aria-label={t('Compare')}>
          <div className="gear-compare-head muted small">
            {worn ? t('Against what {name} wears now: {item}', { name: shortName(state, hero.id), item: itemLabel(worn.name) }) : t('{name} has nothing in this slot yet.', { name: shortName(state, hero.id) })}
          </div>
          {rows.length === 0 && <div className="lr-empty">{t('No other item of this kind in the Armory.')}</div>}
          {rows.map((r) => (
            <div key={r.item.id} className={`gear-cmp-row ${r.ok ? '' : 'off'}`}>
              <span className="gear-name">
                <span className={`gear-grade g-${r.item.grade}`}>{r.item.grade}</span> {itemLabel(r.item.name)} <ItemTags state={state} item={r.item} />
                {r.wearer && <span className="gear-tag worn">{t('worn by {name}', { name: shortName(state, r.wearer.id) })}</span>}
                {!r.autoOk && r.ok && r.item.element && <span className="gear-tag" title={t('Changes the wielder’s element')}>⚠ {t('element')}</span>}
              </span>
              <span className="gear-deltas">
                {r.delta.stats.map((d) => (
                  <span key={d.key} className={d.delta > 0 ? 'up' : 'down'}>
                    {deltaText(d.key, d.delta)}
                  </span>
                ))}
                <span className={`gear-cp ${r.delta.cp > 0 ? 'up' : r.delta.cp < 0 ? 'down' : ''}`}>
                  {r.delta.cp >= 0 ? '+' : '−'}
                  {Math.abs(r.delta.cp)} {t('CP')}
                </span>
              </span>
              <button
                type="button"
                className="pbtn sm"
                disabled={!r.ok}
                onClick={() => run({ type: 'EQUIP_ITEM', heroId: hero.id, itemId: r.item.id }, t('Equipped {item}', { item: itemLabel(r.item.name) }))}
                title={r.ok ? undefined : r.wearer ? t('{name} wears it', { name: r.wearer.name }) : t('Bound to another hero')}
              >
                {t('Equip')}
              </button>
            </div>
          ))}
        </div>
      )}
      {done && !err && <div className="lr-action-note">✓ {done}</div>}
      {err && <div className="err">{err}</div>}
    </div>
  )
}
