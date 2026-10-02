import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Element, GameState, HeroClass, HeroId, Line, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { suggestParty, heroCp } from '../../engine/scout'
import { levelCapForStar } from '../../engine/stats'
import { HeroCard } from '../HeroCard'
import { CLASS_VIS, ClassIcon, ELEMENT_VIS, ElementIcon, STAR_COLOR, Stars, classGlyph, classLabel } from '../bits'
import { heroBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import {
  NO_FILTER,
  SORT_KEYS,
  addHero,
  boardHeroes,
  cleanDraft,
  deployable,
  heroStatus,
  lineSummary,
  placeHero,
  removeAt,
  shownStarOf,
  type BoardFilter,
  type Draft,
  type HeroStatus,
  type SortKey,
} from './partyBoard'
import './party.css'

/**
 * The Party Board (Tactical Center): the formation on top — five slots in three lines —
 * and every living hero below as a compact, sortable, filterable list (or the old card
 * grid). Heroes move by drag and drop (pointer events, so it works with a mouse and, via
 * the ⠿ grip, on touch), by click (add / remove), or by keyboard (focus a hero, press
 * 1–5). Every change is saved at once — there's no draft to lose on the way out.
 */

const DEFAULT_LINES: Line[] = ['front', 'front', 'mid', 'back', 'back']
const PREFS_KEY = 'pmu.partyBoard'

type View = 'list' | 'cards'
interface Prefs {
  view: View
  sort: SortKey
  flip: boolean
}
const DEFAULT_PREFS: Prefs = { view: 'list', sort: 'cp', flip: false }

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<Prefs>
    return {
      view: p.view === 'cards' ? 'cards' : 'list',
      sort: p.sort && SORT_KEYS.includes(p.sort) ? p.sort : 'cp',
      flip: p.flip === true,
    }
  } catch {
    return DEFAULT_PREFS
  }
}
function writePrefs(p: Prefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* storage may be unavailable — the choice just won't stick */
  }
}

const SORT_LABEL: Record<SortKey, string> = {
  cp: 'CP',
  level: 'Level',
  stars: 'Stars',
  name: 'Name',
  element: 'Element',
  class: 'Class',
}

const STATUS_LABEL: Record<HeroStatus, string> = {
  ready: 'Ready',
  weary: 'Weary',
  broken: 'Broken',
  training: 'Training',
  promoting: 'Promoting',
  away: 'Away',
  captive: 'Captive',
  bounty: 'Bounty',
  burnout: 'Burnt out',
}
const STATUS_HINT: Record<HeroStatus, string> = {
  ready: 'Rested and fit to fight.',
  weary: 'Low Sanity — can fight, but the scout won’t pick them.',
  broken: 'Sanity 0 — cannot fight until they recover.',
  training: 'In a Training Center drill — cannot fight.',
  promoting: 'In the Promotion Chamber — cannot fight.',
  away: 'Away on a Ruins expedition — cannot fight.',
  captive: 'Held by a rival Master — cannot fight.',
  bounty: 'Out on a bounty — cannot fight until they return.',
  burnout: 'Burnt out — resting, refuses the tower for now.',
}

function StatusChip({ hero, state }: { hero: OwnedHero; state: GameState }) {
  const s = heroStatus(hero, state)
  return (
    <span className={`pb-status st-${s}`} title={`${t(STATUS_HINT[s])} ${t('Sanity {n}', { n: Math.round(hero.sanity) })}`}>
      {t(STATUS_LABEL[s])}
    </span>
  )
}

function Bust({ hero, size }: { hero: OwnedHero; size: number }) {
  const c = ELEMENT_VIS[hero.element].color
  return (
    <span className="pb-bust" style={{ width: size, height: size, background: `linear-gradient(180deg, ${c}55 0%, #120e2c 85%)` }}>
      <img className="px" src={heroBustUrl(hero)} alt="" width={size} height={size} />
    </span>
  )
}

/** What is being dragged: a hero from the list, or the occupant of a slot. */
type DragSrc = { kind: 'hero'; id: HeroId } | { kind: 'slot'; index: number; id: HeroId }
interface DragState {
  src: DragSrc
  x: number
  y: number
  /** The slot under the pointer, 'list' over the hero list (drop = take off the board). */
  over: number | 'list' | null
}

function dropTargetAt(x: number, y: number): number | 'list' | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  const slot = el?.closest('[data-slot]') as HTMLElement | null
  if (slot) return Number(slot.dataset.slot)
  if (el?.closest('[data-drop="list"]')) return 'list'
  return null
}

export function PartyScreen({ state, store }: { state: GameState; store: Store }) {
  const lines = state.party.lines.length === DEFAULT_LINES.length ? state.party.lines : DEFAULT_LINES
  const draft = cleanDraft(state, state.party.slots)
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs)
  const [filter, setFilter] = useState<BoardFilter>(NO_FILTER)
  const [note, setNote] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<HeroId | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const justDragged = useRef(false)

  const setPrefs = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p }
    setPrefsState(next)
    writePrefs(next)
  }

  const heroes = useMemo(() => boardHeroes(state, prefs.sort, filter, { flip: prefs.flip }), [state, prefs.sort, prefs.flip, filter])
  const livingCount = useMemo(() => Object.values(state.heroes).filter((h) => h.alive).length, [state.heroes])
  const summary = lineSummary(state, draft, lines)
  const totalCp = summary.reduce((n, l) => n + l.cp, 0)
  const deployed = draft.filter(Boolean).length
  const benched = draft.flatMap((id) => (id && state.heroes[id] && !deployable(state.heroes[id]!, state) ? [state.heroes[id]!] : []))

  function commit(next: Draft) {
    if (JSON.stringify(next) === JSON.stringify(state.party.slots)) return
    store.dispatch({ type: 'SET_PARTY', slots: next, lines })
  }

  function toggleHero(id: HeroId) {
    setNote(null)
    const i = draft.indexOf(id)
    if (i !== -1) return commit(removeAt(draft, i))
    if (!draft.includes(null)) {
      setNote(t('The party is full — drag onto a slot, or focus a hero and press 1–5 to replace.'))
      return
    }
    commit(addHero(draft, id))
  }

  function drop(src: DragSrc, over: number | 'list' | null) {
    setNote(null)
    if (over === null) return
    if (over === 'list') {
      if (src.kind === 'slot') commit(removeAt(draft, src.index))
      return
    }
    commit(placeHero(draft, src.id, over))
  }

  function suggest() {
    const p = suggestParty(state)
    if (!p.slots.some(Boolean)) {
      setNote(t('No hero is rested enough to suggest — let them recover first.'))
      return
    }
    setNote(null)
    store.dispatch({ type: 'SET_PARTY', slots: p.slots, lines: p.lines })
  }

  // Pointer drag: mouse anywhere on a row / slot, touch only from the ⠿ grip (so the list still scrolls).
  function startDrag(e: ReactPointerEvent, src: DragSrc) {
    if (e.button !== 0) return
    if (e.pointerType === 'touch' && !(e.target as HTMLElement).closest('.pb-grip')) return
    const sx = e.clientX
    const sy = e.clientY
    let active = false
    let last = { x: sx, y: sy }
    let scroll: ReturnType<typeof setInterval> | null = null
    const move = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY }
      if (!active && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return
      if (!active) {
        active = true
        // Near the top/bottom edge the page scrolls, so the slots are always reachable.
        scroll = setInterval(() => {
          const edge = 70
          if (last.y < edge) window.scrollBy(0, -16)
          else if (last.y > window.innerHeight - edge) window.scrollBy(0, 16)
        }, 30)
      }
      ev.preventDefault()
      setDrag({ src, x: ev.clientX, y: ev.clientY, over: dropTargetAt(ev.clientX, ev.clientY) })
    }
    const end = (ev: PointerEvent, cancelled: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      if (scroll) clearInterval(scroll)
      if (!active) return
      justDragged.current = true
      setTimeout(() => (justDragged.current = false), 250)
      setDrag(null)
      if (!cancelled) drop(src, dropTargetAt(ev.clientX, ev.clientY))
    }
    const up = (ev: PointerEvent) => end(ev, false)
    const cancel = (ev: PointerEvent) => end(ev, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const clickGuard = (fn: () => void) => () => {
    if (!justDragged.current) fn()
  }

  // Keyboard: 1–5 drops the focused hero (or slot occupant) into that slot.
  function heroKeys(e: ReactKeyboardEvent, id: HeroId) {
    const n = Number(e.key)
    if (Number.isInteger(n) && n >= 1 && n <= draft.length) {
      e.preventDefault()
      setNote(null)
      commit(placeHero(draft, id, n - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleHero(id)
    }
  }
  function slotKeys(e: ReactKeyboardEvent, i: number) {
    const id = draft[i]
    const n = Number(e.key)
    if (id && Number.isInteger(n) && n >= 1 && n <= draft.length) {
      e.preventDefault()
      commit(placeHero(draft, id, n - 1))
    } else if (id && (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      commit(removeAt(draft, i))
    }
  }

  // Forget a focus that points at a hero no longer listed.
  useEffect(() => {
    if (focusId && !state.heroes[focusId]?.alive) setFocusId(null)
  }, [focusId, state.heroes])

  const dragHero = drag ? state.heroes[drag.src.id] : undefined
  const focused = focusId ? state.heroes[focusId] : undefined

  const sortHeader = (key: SortKey, label: string, cls: string) => (
    <button
      className={`pb-th ${cls} ${prefs.sort === key ? 'on' : ''}`}
      onClick={() => setPrefs(prefs.sort === key ? { flip: !prefs.flip } : { sort: key, flip: false })}
      title={t('Sort by {key}', { key: t(SORT_LABEL[key]) })}
    >
      {label}
      {prefs.sort === key ? (prefs.flip ? ' ▴' : ' ▾') : ''}
    </button>
  )

  return (
    <div className={`screen party-board ${drag ? 'dragging' : ''}`}>
      <h2>{t('Party')}</h2>

      <section className="pb-formation pframe" aria-label={t('Formation')}>
        <div className="pb-head">
          <div className="pb-total">
            <span className="cp">
              <span className="lab">{t('Total CP')} </span>
              {totalCp.toLocaleString()}
            </span>
            <span className="muted">{t('{n}/5 deployed', { n: deployed })}</span>
          </div>
          <div className="pb-actions">
            <button className="pbtn sm gem" onClick={suggest} disabled={livingCount === 0} title={t('The strongest rested heroes, sturdy in front')}>
              ✦ {t('Suggest a party')}
            </button>
            <button className="pbtn sm ghost" onClick={() => (setNote(null), commit(draft.map(() => null)))} disabled={deployed === 0}>
              {t('Clear')}
            </button>
          </div>
        </div>

        <div className="pb-lines">
          {summary.map((l) => (
            <div key={l.line} className={`pb-line line-${l.line}`} style={{ flexGrow: l.slots.length }}>
              <div className="pb-line-head">
                <span className="pb-line-name">{t(l.line)}</span>
                <span className="pb-line-cp">
                  {l.count}/{l.slots.length} · {t('CP')} {l.cp.toLocaleString()}
                </span>
              </div>
              <div className="pb-line-slots">
                {l.slots.map((i) => {
                  const id = draft[i]
                  const h = id ? state.heroes[id] : undefined
                  const over = drag?.over === i
                  const lifted = drag?.src.kind === 'slot' && drag.src.index === i
                  return (
                    <div
                      key={i}
                      data-slot={i}
                      role="button"
                      tabIndex={0}
                      className={`pb-slot ${h ? 'filled' : ''} ${over ? 'over' : ''} ${lifted ? 'lifted' : ''} ${h && !deployable(h, state) ? 'benched' : ''}`}
                      onPointerDown={h ? (e) => startDrag(e, { kind: 'slot', index: i, id: h.id }) : undefined}
                      onClick={clickGuard(() => h && (setNote(null), commit(removeAt(draft, i))))}
                      onKeyDown={(e) => slotKeys(e, i)}
                      aria-label={h ? t('Slot {n}: {name} — press Delete to remove', { n: i + 1, name: h.name }) : t('Slot {n}: empty', { n: i + 1 })}
                      title={h ? t('Drag to move · click to remove') : t('Drop a hero here')}
                    >
                      <span className="pb-slot-n">{i + 1}</span>
                      {h ? (
                        <>
                          {h && <span className="pb-grip pb-slot-grip" aria-hidden>⠿</span>}
                          <Bust hero={h} size={48} />
                          <span className="pb-slot-name">{h.name.split(/\s+/)[0]}</span>
                          <span className="pb-slot-meta">
                            <span style={{ color: STAR_COLOR[shownStarOf(h, state)] }}>{shownStarOf(h, state)}★</span>
                            <span className="cp">{heroCp(h, state).toLocaleString()}</span>
                          </span>
                          {!deployable(h, state) && <StatusChip hero={h} state={state} />}
                        </>
                      ) : (
                        <span className="pb-slot-empty">{t('+ empty')}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {benched.length > 0 && (
          <div className="pb-warn">⚠ {t('{names} can’t fight right now and will sit this one out.', { names: benched.map((h) => h.name.split(/\s+/)[0]).join(', ') })}</div>
        )}
        {note && <div className="pb-note">{note}</div>}
        <div className="pb-hint muted">
          {focused
            ? t('{name} selected — press 1–5 to place them, Enter to add or remove.', { name: focused.name })
            : t('Drag a hero onto a slot · click to add or remove · Tab to a hero and press 1–5.')}
        </div>
      </section>

      <div className="pb-toolbar" role="group" aria-label={t('Sort and filter')}>
        <input
          className="pinput pb-search"
          type="search"
          placeholder={t('Search heroes…')}
          aria-label={t('Search heroes by name')}
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
        />
        <label className="pb-field">
          <span>{t('Sort')}</span>
          <select className="pinput" value={prefs.sort} onChange={(e) => setPrefs({ sort: e.target.value as SortKey, flip: false })}>
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(SORT_LABEL[k])}
              </option>
            ))}
          </select>
          <button className="pbtn sm ghost" onClick={() => setPrefs({ flip: !prefs.flip })} title={t('Reverse the order')} aria-label={t('Reverse the order')}>
            {prefs.flip ? '▴' : '▾'}
          </button>
        </label>
        <select className="pinput" aria-label={t('Element')} value={filter.element} onChange={(e) => setFilter({ ...filter, element: e.target.value as Element | 'all' })}>
          <option value="all">{t('All elements')}</option>
          {(Object.keys(ELEMENT_VIS) as Element[]).map((el) => (
            <option key={el} value={el}>
              {t(ELEMENT_VIS[el].label)}
            </option>
          ))}
        </select>
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
        <select className="pinput" aria-label={t('Stars')} value={filter.minStar} onChange={(e) => setFilter({ ...filter, minStar: Number(e.target.value) })}>
          <option value={0}>{t('Any ★')}</option>
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {t('{n}★ and up', { n })}
            </option>
          ))}
        </select>
        <label className="pb-check">
          <input type="checkbox" checked={filter.hideUnavailable} onChange={(e) => setFilter({ ...filter, hideUnavailable: e.target.checked })} />
          {t('Hide unavailable')}
        </label>
        <span className="spacer" />
        <div className="pb-viewtoggle" role="group" aria-label={t('View')}>
          <button className={`pbtn sm ${prefs.view === 'list' ? 'on' : 'ghost'}`} onClick={() => setPrefs({ view: 'list' })} aria-pressed={prefs.view === 'list'}>
            ☰ {t('List')}
          </button>
          <button className={`pbtn sm ${prefs.view === 'cards' ? 'on' : 'ghost'}`} onClick={() => setPrefs({ view: 'cards' })} aria-pressed={prefs.view === 'cards'}>
            ▦ {t('Cards')}
          </button>
        </div>
      </div>

      <div className="pb-count muted">
        {heroes.length === livingCount
          ? t('{n} living heroes', { n: livingCount })
          : t('{shown} of {n} living heroes shown', { shown: heroes.length, n: livingCount })}
        {JSON.stringify(filter) !== JSON.stringify(NO_FILTER) && (
          <button className="linkish" onClick={() => setFilter(NO_FILTER)} style={{ marginLeft: 8 }}>
            {t('Reset filters')}
          </button>
        )}
      </div>

      <div data-drop="list" className={`pb-listwrap ${drag?.over === 'list' && drag.src.kind === 'slot' ? 'over' : ''}`}>
        {livingCount === 0 && <div className="empty">{t('No living heroes. Summon to recruit.')}</div>}
        {livingCount > 0 && heroes.length === 0 && <div className="empty">{t('No hero matches these filters.')}</div>}

        {prefs.view === 'list' && heroes.length > 0 && (
          <div className="pb-list" role="list">
            <div className="pb-row pb-thead" aria-hidden>
              <span />
              <span />
              {sortHeader('name', t('Name'), 'c-name')}
              {sortHeader('stars', '★', 'c-star')}
              {sortHeader('class', t('Class'), 'c-class')}
              {sortHeader('element', t('Element'), 'c-el')}
              {sortHeader('level', t('Lv'), 'c-lv')}
              {sortHeader('cp', t('CP'), 'c-cp')}
              <span className="c-slot" />
            </div>
            {heroes.map((h) => {
              const slot = draft.indexOf(h.id)
              const star = shownStarOf(h, state)
              const st = heroStatus(h, state)
              return (
                <div
                  key={h.id}
                  role="listitem"
                  tabIndex={0}
                  data-hero={h.id}
                  className={`pb-row ${slot !== -1 ? 'in' : ''} ${drag?.src.id === h.id ? 'lifted' : ''} ${deployable(h, state) ? '' : 'unavail'}`}
                  onPointerDown={(e) => startDrag(e, { kind: 'hero', id: h.id })}
                  onClick={clickGuard(() => toggleHero(h.id))}
                  onKeyDown={(e) => heroKeys(e, h.id)}
                  onFocus={() => setFocusId(h.id)}
                  onBlur={() => setFocusId((f) => (f === h.id ? null : f))}
                  aria-label={`${h.name}, ${star}★, ${classLabel(h.heroClass)}, ${t(ELEMENT_VIS[h.element].label)}, ${t('Lv {level}', { level: h.xp.level })}, ${t('CP')} ${heroCp(h, state)}${slot !== -1 ? `, ${t('in slot {n}', { n: slot + 1 })}` : ''}`}
                >
                  <span className="pb-grip" aria-hidden title={t('Drag onto a slot')}>
                    ⠿
                  </span>
                  <Bust hero={h} size={32} />
                  <span className="c-name">
                    <span className="pb-name">{h.name}</span>
                    {st !== 'ready' && <StatusChip hero={h} state={state} />}
                  </span>
                  <span className="c-star" style={{ color: STAR_COLOR[star] }}>
                    <Stars star={star} />
                  </span>
                  <span className="c-class" title={classLabel(h.heroClass)}>
                    <ClassIcon heroClass={h.heroClass} /> <span className="pb-wide">{classLabel(h.heroClass)}</span>
                  </span>
                  <span className="c-el" style={{ color: ELEMENT_VIS[h.element].color }} title={t(ELEMENT_VIS[h.element].label)}>
                    <ElementIcon element={h.element} /> <span className="pb-wide">{t(ELEMENT_VIS[h.element].label)}</span>
                  </span>
                  <span className="c-lv">
                    {h.xp.level}
                    <span className="pb-cap">/{levelCapForStar(h.star)}</span>
                  </span>
                  <span className="c-cp cp">{heroCp(h, state).toLocaleString()}</span>
                  <span className="c-slot">{slot !== -1 ? <span className="pb-inslot">#{slot + 1}</span> : <span className="pb-add">+</span>}</span>
                </div>
              )
            })}
          </div>
        )}

        {prefs.view === 'cards' && heroes.length > 0 && (
          <div className="grid cards">
            {heroes.map((h) => (
              <div
                key={h.id}
                tabIndex={0}
                className={`pb-cardwrap ${drag?.src.id === h.id ? 'lifted' : ''}`}
                onPointerDown={(e) => startDrag(e, { kind: 'hero', id: h.id })}
                onKeyDown={(e) => heroKeys(e, h.id)}
                onFocus={() => setFocusId(h.id)}
                onBlur={() => setFocusId((f) => (f === h.id ? null : f))}
              >
                <HeroCard hero={h} selected={draft.includes(h.id)} masterLevel={state.meta.masterLevel} onClick={clickGuard(() => toggleHero(h.id))} />
              </div>
            ))}
          </div>
        )}
      </div>

      {drag && dragHero && (
        <div className="pb-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden>
          <Bust hero={dragHero} size={40} />
          <span>
            <b>{dragHero.name.split(/\s+/)[0]}</b>
            <br />
            <span className="muted">
              {typeof drag.over === 'number'
                ? t('→ slot {n}', { n: drag.over + 1 })
                : drag.over === 'list' && drag.src.kind === 'slot'
                  ? t('take off the board')
                  : t('drop on a slot')}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
