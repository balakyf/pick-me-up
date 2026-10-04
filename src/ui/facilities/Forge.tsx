/**
 * The Forge's work order, shown clearly (lane N; it was lifePanels' ForgeOrderSection): what
 * the smiths are told to make, who is smithing, what is on the anvil and how far along,
 * what the next piece costs and whether the storeroom can pay for it, what "whatever the
 * party needs" would make next, and the last pieces the smiths finished.
 */
import type { ForgeOrder, GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { forgeCost, forgeGrade, itemName, smithyUnlocked } from '../../engine/equipment'
import { autoForgeSlot, jobHolders } from '../../engine/life'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { chronicleLine, shortName } from '../life/speech'
import { SLOT_GLYPH, SLOT_NAME, itemLabel } from './gearText'

const ORDERS: { id: ForgeOrder | null; label: string; blurb: string }[] = [
  { id: null, label: 'Stand down', blurb: 'The smiths make nothing (and spend nothing).' },
  { id: 'auto', label: 'Whatever the party needs', blurb: 'The smiths fill the party’s empty or outgrown slots, and rest when nothing is needed.' },
  { id: 'weapon', label: 'Weapons', blurb: 'The smiths make weapons, one after another.' },
  { id: 'armor', label: 'Armor', blurb: 'The smiths make armor, one after another.' },
  { id: 'accessory', label: 'Accessories', blurb: 'The smiths make accessories, one after another.' },
]

export function ForgeOrders({ state, store }: { state: GameState; store: Store }) {
  if (!smithyUnlocked(state)) return null
  const order = state.life.forge.order
  const wip = state.life.forge.wip
  const grade = forgeGrade(state.meta.masterLevel)
  const cost = forgeCost(grade)
  const need = wip ? TUNING.life.jobs.forgeWork[wip.grade] ?? 20 : 0
  const pct = wip && need > 0 ? Math.min(100, Math.round((wip.progress / need) * 100)) : 0
  const auto = order === 'auto' ? autoForgeSlot(state) : null
  const smiths = jobHolders(state, 'blacksmith')
  const canPay = state.gold >= cost.gold && (state.materials.promotionStone ?? 0) >= cost.promotionStone
  const current = ORDERS.find((o) => o.id === order) ?? ORDERS[0]!
  const recent = state.life.chronicle.filter((e) => e.kind === 'forged' || e.kind === 'masterwork').slice(-4).reverse()
  // What the smiths will do next, in one line.
  const next =
    order === null
      ? t('The forge is cold.')
      : smiths.length === 0
        ? t('No smith works the forge — give a hero the Blacksmith job.')
        : wip
          ? t('Hammering on a {grade} {slot} ({n}%).', { grade: wip.grade, slot: t(SLOT_NAME[wip.slot]).toLowerCase(), n: pct })
          : order === 'auto' && auto === null
            ? t('The party is fully equipped — the smiths rest.')
            : !canPay
              ? t('Stalled: the next piece needs {gold} ◆ and {n} Promotion Stones.', { gold: cost.gold.toLocaleString(), n: cost.promotionStone })
              : t('Next: a {item}.', { item: itemLabel(itemName((order === 'auto' ? auto : order) ?? 'weapon', grade)) })
  const stalled = order !== null && smiths.length > 0 && !wip && !canPay && !(order === 'auto' && auto === null)

  return (
    <div className="forge-orders">
      <h4 className="panel-sub">{t('Forge orders')}</h4>
      <div className="order-row" role="group" aria-label={t('Work order')}>
        {ORDERS.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            className={`pbtn sm ${order === o.id ? 'on' : ''}`}
            aria-pressed={order === o.id}
            onClick={() => store.dispatch({ type: 'SET_FORGE_ORDER', order: o.id }, Date.now())}
          >
            {o.id && o.id !== 'auto' ? `${SLOT_GLYPH[o.id]} ` : ''}
            {t(o.label)}
          </button>
        ))}
      </div>
      <div className="muted small">
        <b>{t(current.label)}</b> — {t(current.blurb)}
      </div>
      <div className={`forge-state ${stalled ? 'stalled' : ''}`}>
        {stalled ? '⚠ ' : '⚒ '}
        {next}
      </div>
      {wip && (
        <div className="forge-now">
          <span>
            {SLOT_GLYPH[wip.slot]} {wip.grade}
          </span>
          <span className="hs-bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="muted small">{pct}%</span>
        </div>
      )}
      <div className="muted small">
        {smiths.length === 0
          ? t('Smiths: none.')
          : tn(smiths.length, 'Smith: {names}', 'Smiths ({n}): {names}', { names: smiths.map((h) => shortName(state, h.id)).join(', ') })}
        {' · '}
        {t('Each piece: {grade}-grade · {gold} ◆ + {stones} Promotion Stones.', { grade, gold: cost.gold.toLocaleString(), stones: cost.promotionStone })}
      </div>
      {recent.length > 0 && (
        <ul className="forge-recent" aria-label={t('Recently forged')}>
          {recent.map((e, i) => (
            <li key={i}>{chronicleLine(state, e)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
