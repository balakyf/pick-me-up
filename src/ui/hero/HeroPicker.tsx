/**
 * The shared hero picker (lane N): one component wherever the Master picks a hero — every
 * facility, the Armory, and the Party Board's swap. Search, sort (CP, stars, level, morale,
 * class), filters (class, element, available, alive), and the naming rule of
 * hero/heroLabel (a disambiguated name, always with star and level). Each place keeps its
 * own validation: `refusal` says why a hero cannot be picked here, and the row is greyed
 * out with that reason. Every row also opens the hero sheet (ⓘ).
 */
import { useMemo, useState } from 'react'
import type { Element, GameState, HeroClass, HeroId, OwnedHero } from '../../engine/types'
import { heroCp } from '../../engine/scout'
import { CLASS_VIS, ClassIcon, ELEMENT_VIS, ElementIcon, Portrait, classLabel } from '../bits'
import { MoralePips } from '../life/MoralePips'
import { t } from '../i18n/i18n'
import { HeroTag, pickerName } from './heroLabel'
import { PICK_ALL, PICK_SORTS, filtered, pickHeroes, type PickFilter, type PickSort } from './heroPicker'
import { openHeroSheet } from './sheetBus'
import './hero.css'

export const SORT_LABEL: Record<PickSort, string> = {
  cp: 'CP',
  stars: 'Stars',
  level: 'Level',
  morale: 'Morale',
  class: 'Class',
  name: 'Name',
  element: 'Element',
}

export interface HeroPickerProps {
  state: GameState
  /** The candidates (default: every hero of the account; the alive filter still applies). */
  heroes?: readonly OwnedHero[]
  /** Who is picked (highlighted). */
  selected?: readonly HeroId[]
  /** Pick (or un-pick) a hero. Without it the picker only browses: a click opens the sheet. */
  onPick?: (id: HeroId) => void
  /** Why this place cannot take the hero now (shown, and the row is disabled), or null. */
  refusal?: (h: OwnedHero) => string | null
  /** A short note after the name (e.g. "in slot 2"). */
  note?: (h: OwnedHero) => string | null
  /** Starting sort and filter. */
  sort?: PickSort
  flip?: boolean
  filter?: Partial<PickFilter>
  /** Accessible name of the list. */
  label: string
  /** Hide the toolbar (tiny lists). Default: shown when there are more than 4 candidates. */
  toolbar?: boolean
  /** Text when nobody is listed. */
  empty?: string
  /** Show the fallen filter (the Registry-like places). */
  allowFallen?: boolean
}

export function HeroPicker({
  state,
  heroes,
  selected = [],
  onPick,
  refusal,
  note,
  sort: sort0 = 'cp',
  flip: flip0 = false,
  filter: filter0,
  label,
  toolbar,
  empty = 'No hero to choose here.',
  allowFallen = false,
}: HeroPickerProps) {
  const start = useMemo<PickFilter>(() => ({ ...PICK_ALL, ...filter0 }), [filter0])
  const [sort, setSort] = useState<PickSort>(sort0)
  const [flip, setFlip] = useState(flip0)
  const [filter, setFilter] = useState<PickFilter>(start)
  const available = (h: OwnedHero) => h.alive && (refusal ? refusal(h) === null : true)
  const pool = heroes ?? (Object.values(state.heroes) as OwnedHero[])
  const list = pickHeroes(state, { sort, flip, filter, pool, available })
  const candidates = pool.filter((h) => (filter.alive === 'all' ? true : filter.alive === 'fallen' ? !h.alive : h.alive)).length
  const showBar = toolbar ?? pool.length > 4
  const picked = new Set<string>(selected)

  return (
    <div className="hp">
      {showBar && (
        <div className="hp-bar" role="group" aria-label={t('Sort and filter')}>
          <input
            className="pinput hp-search"
            type="search"
            placeholder={t('Search heroes…')}
            aria-label={t('Search heroes by name')}
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
          <span className="hp-field">
            <select className="pinput" aria-label={t('Sort')} value={sort} onChange={(e) => (setSort(e.target.value as PickSort), setFlip(false))}>
              {PICK_SORTS.map((k) => (
                <option key={k} value={k}>
                  {t('Sort: {key}', { key: t(SORT_LABEL[k]) })}
                </option>
              ))}
            </select>
            <button type="button" className="pbtn sm ghost" onClick={() => setFlip(!flip)} title={t('Reverse the order')} aria-label={t('Reverse the order')}>
              {flip ? '▴' : '▾'}
            </button>
          </span>
          <select
            className="pinput"
            aria-label={t('Class')}
            value={filter.heroClass}
            onChange={(e) => setFilter({ ...filter, heroClass: e.target.value as HeroClass | 'none' | 'all' })}
          >
            <option value="all">{t('All classes')}</option>
            {(Object.keys(CLASS_VIS) as HeroClass[]).map((c) => (
              <option key={c} value={c}>
                {classLabel(c)}
              </option>
            ))}
            <option value="none">{classLabel(null)}</option>
          </select>
          <select className="pinput" aria-label={t('Element')} value={filter.element} onChange={(e) => setFilter({ ...filter, element: e.target.value as Element | 'all' })}>
            <option value="all">{t('All elements')}</option>
            {(Object.keys(ELEMENT_VIS) as Element[]).map((el) => (
              <option key={el} value={el}>
                {t(ELEMENT_VIS[el].label)}
              </option>
            ))}
          </select>
          <label className="hp-check">
            <input type="checkbox" checked={filter.availableOnly} onChange={(e) => setFilter({ ...filter, availableOnly: e.target.checked })} />
            {t('Available only')}
          </label>
          {allowFallen && (
            <select className="pinput" aria-label={t('Living or fallen')} value={filter.alive} onChange={(e) => setFilter({ ...filter, alive: e.target.value as PickFilter['alive'] })}>
              <option value="living">{t('The living')}</option>
              <option value="fallen">{t('The fallen')}</option>
              <option value="all">{t('Everyone')}</option>
            </select>
          )}
        </div>
      )}
      {showBar && (
        <div className="hp-count muted small">
          {list.length === candidates ? t('{n} heroes', { n: candidates }) : t('{shown} of {n} shown', { shown: list.length, n: candidates })}
          {filtered(filter, start) && (
            <button type="button" className="linkish" onClick={() => setFilter(start)}>
              {t('Reset filters')}
            </button>
          )}
        </div>
      )}
      {list.length === 0 ? (
        <div className="lr-empty">{pool.length === 0 ? t(empty) : t('No hero matches these filters.')}</div>
      ) : (
        <ul className="hp-list" aria-label={label}>
          {list.map((h) => {
            const why = refusal ? refusal(h) : null
            const on = picked.has(h.id)
            const extra = note ? note(h) : null
            return (
              <li key={h.id} className={`hp-row ${on ? 'sel' : ''} ${why ? 'off' : ''} ${h.alive ? '' : 'dead'}`}>
                <button
                  type="button"
                  className="hp-pick"
                  aria-pressed={onPick ? on : undefined}
                  disabled={!!onPick && why !== null && !on}
                  onClick={() => (onPick ? onPick(h.id) : openHeroSheet(h.id))}
                  title={why ? t(why) : onPick ? undefined : t('Open the hero sheet')}
                >
                  <Portrait hero={h} size="sm" />
                  <span className="hp-main">
                    <span className="hp-name">
                      {pickerName(state, h)} <HeroTag hero={h} />
                      {!h.alive && <span className="hp-dead"> ☠</span>}
                    </span>
                    <span className="hp-meta">
                      <ClassIcon heroClass={h.heroClass} /> <ElementIcon element={h.element} />
                      {h.alive && <MoralePips state={state} heroId={h.id} />}
                      <span className="cp">{heroCp(h, state).toLocaleString()}</span>
                      {extra && <span className="hp-note">{extra}</span>}
                    </span>
                    {why && <span className="hp-why">{t(why)}</span>}
                  </span>
                </button>
                <button type="button" className="hp-info pbtn sm ghost" onClick={() => openHeroSheet(h.id)} title={t('Open the hero sheet')} aria-label={t('Open {name}’s sheet', { name: h.name })}>
                  ⓘ
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
