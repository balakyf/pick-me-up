/**
 * The estate in the place panels (spec 2026-09-30-estate-and-life): decorations for sale
 * where they stand, statues at the Memorial, the bounty board in the Tavern, tryout duels
 * and the paid drill refocus at the Training Center — and the Construction Board's
 * "Decorate" tab. Every action is a Command; nothing here decides a rule.
 */
import { useEffect, useMemo, useState } from 'react'
import type { CombatLog, Command, GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { SKILLS } from '../../engine/content'
import { toWorldTime } from '../../engine/time'
import { trainingOptions } from '../../engine/training'
import {
  BOUNTIES,
  BOUNTY,
  DECOR_MAX_LEVEL,
  STATUE,
  benchHeroes,
  bountyRefusal,
  decorOptions,
  duelBattle,
  duelPurse,
  duelRefusal,
  duelsLeft,
  estateOf,
  fatigueAt,
  favouriteOf,
  giftMeanings,
  hasStatue,
  isBurntOut,
  refocusCost,
  refocusRefusal,
  statueCost,
  statueRefusal,
  traumaOf,
  worldDay,
} from '../../engine/estate'
import type { PanelPlace } from '../facilityPanels'
import { Portrait } from '../bits'
import { PixelWindow } from '../kit'
import { heroFrameUrl } from '../pixel/sprites'
import { shortName } from './speech'
import { t } from '../i18n/i18n'
import './estate.css'
import { reducedMotion } from '../motion'

const first = (n: string) => n.split(/\s+/)[0] ?? n

function useRun(store: Store): [string | null, (cmd: Command) => boolean] {
  const [err, setErr] = useState<string | null>(null)
  const run = (cmd: Command) => {
    setErr(null)
    try {
      store.dispatch(cmd, Date.now())
      return true
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Action failed'))
      return false
    }
  }
  return [err, run]
}

/** World-time left, like the facility timers ("3h 20m left"). */
function timeLeft(ms: number): string {
  if (ms <= 0) return t('finishing…')
  const mins = Math.ceil(ms / 60_000)
  if (mins < 60) return t('{m}m left', { m: mins })
  return t('{h}h {m}m left', { h: Math.floor(mins / 60), m: mins % 60 })
}

const PLACE_DECOR: Partial<Record<PanelPlace, string>> = {
  dormitory: 'dormitory',
  tavern: 'tavern',
  garden: 'garden',
  trainingCenter: 'yard',
}

/** Everything the estate adds to one place's panel. */
export function EstateSection({ place, state, store }: { place: PanelPlace; state: GameState; store: Store }) {
  const decorPlace = PLACE_DECOR[place]
  return (
    <>
      {decorPlace && <DecorList state={state} store={store} place={decorPlace} title={t('Decorate')} />}
      {place === 'memorial' && <StatueSection state={state} store={store} />}
      {place === 'tavern' && <BountyBoard state={state} store={store} />}
      {place === 'trainingCenter' && (
        <>
          <DuelSection state={state} store={store} />
          <RefocusSection state={state} store={store} />
        </>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Decorations
// ─────────────────────────────────────────────────────────────────────────────

function Pips({ n, max }: { n: number; max: number }) {
  return (
    <span className="est-pips" aria-label={t('Level {n} of {max}', { n, max })}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < n ? 'on' : ''} />
      ))}
    </span>
  )
}

export function DecorList({ state, store, place, title }: { state: GameState; store: Store; place?: string; title?: string }) {
  const [err, run] = useRun(store)
  const opts = decorOptions(state, place)
  if (opts.length === 0) return null
  return (
    <div className="est-block">
      {title && <h4 className="panel-sub">{title}</h4>}
      {opts.map(({ def, level, cost, refusal }) => (
        <div key={def.id} className="est-row">
          <div className="est-main">
            <b>{t(def.name)}</b> <Pips n={level} max={DECOR_MAX_LEVEL} />
            <div className="muted small">{t(def.blurb)}</div>
          </div>
          {cost === null ? (
            <span className="chip">{t('Finest')}</span>
          ) : (
            <button
              className="btn sm"
              disabled={refusal !== null}
              title={refusal ? t(refusal) : undefined}
              onClick={() => run({ type: 'BUY_DECOR', decor: def.id })}
            >
              {level === 0 ? t('Buy') : t('Improve')} · {cost.toLocaleString()} ◆
            </button>
          )}
        </div>
      ))}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

/** The Construction Board's tabs: Build (the buildings) and Decorate (the estate). */
export function BoardTabs({ tab, onTab }: { tab: 'build' | 'decor'; onTab: (t: 'build' | 'decor') => void }) {
  return (
    <div className="est-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'build'} className={`pbtn sm ${tab === 'build' ? 'primary' : 'ghost'}`} onClick={() => onTab('build')}>
        🔨 {t('Build')}
      </button>
      <button role="tab" aria-selected={tab === 'decor'} className={`pbtn sm ${tab === 'decor' ? 'primary' : 'ghost'}`} onClick={() => onTab('decor')}>
        🏮 {t('Decorate')}
      </button>
    </div>
  )
}

export function DecorateTab({ state, store }: { state: GameState; store: Store }) {
  return (
    <div>
      <p className="place-blurb">{t('Decorations make the estate a home: each one is drawn on the campus and gently lifts the heroes’ days. Statues are raised at the Memorial.')}</p>
      <DecorList state={state} store={store} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Statues
// ─────────────────────────────────────────────────────────────────────────────

function StatueSection({ state, store }: { state: GameState; store: Store }) {
  const [err, run] = useRun(store)
  const e = estateOf(state)
  const graves = [...state.life.memorial].reverse()
  if (graves.length === 0) return null
  return (
    <div className="est-block">
      <h4 className="panel-sub">
        {t('Statues')} · {e.statues.length}/{STATUE.max}
      </h4>
      <p className="muted small">{t('A statue in their likeness: those who mourn them heal faster, and every visitor to the Memorial finds a little peace.')}</p>
      {graves.slice(0, 12).map((g) => {
        const done = hasStatue(state, g.heroId)
        const refusal = statueRefusal(state, g.heroId)
        return (
          <div key={g.heroId} className="est-row">
            <div className="est-main">
              <b>{g.name}</b> <span className="muted small">{g.star}★ Lv{g.level}</span>
              {g.mourners.length > 0 && <div className="muted small">{t('mourned by {names}', { names: g.mourners.map((m) => shortName(state, m)).join(', ') })}</div>}
            </div>
            {done ? (
              <span className="chip">🗿 {t('Statue raised')}</span>
            ) : (
              <button className="btn sm" disabled={refusal !== null} title={refusal ? t(refusal) : undefined} onClick={() => run({ type: 'RAISE_STATUE', heroId: g.heroId })}>
                🗿 {statueCost(g).toLocaleString()} ◆
              </button>
            )}
          </div>
        )
      })}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The bounty board
// ─────────────────────────────────────────────────────────────────────────────

function haulLine(materials: Record<string, number>, xp: number, item: string | null): string {
  const parts: string[] = []
  if (materials.promotionStone) parts.push(t('{n} Promotion Stones', { n: materials.promotionStone }))
  if (materials.rankMaterial) parts.push(t('{n} Rank Materials', { n: materials.rankMaterial }))
  const attr = Object.entries(materials)
    .filter(([k]) => k.startsWith('attrStone_'))
    .reduce((a, [, v]) => a + v, 0)
  if (attr) parts.push(t('{n} Attribute Stones', { n: attr }))
  if (xp) parts.push(t('{n} XP', { n: xp.toLocaleString() }))
  if (item) parts.push(`⚒ ${item}`)
  return parts.join(' · ')
}

function BountyBoard({ state, store }: { state: GameState; store: Store }) {
  const [err, run] = useRun(store)
  const [kind, setKind] = useState<string | null>(null)
  const [picked, setPicked] = useState<HeroId[]>([])
  const e = estateOf(state)
  const nowWorld = toWorldTime(Date.now())
  const bench = benchHeroes(state).sort((a, b) => a.xp.level - b.xp.level)
  const def = kind ? BOUNTIES[kind] : null
  const toggle = (id: HeroId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : def && p.length >= def.heroes ? [...p.slice(1), id] : [...p, id]))
  const post = () => {
    if (!kind) return
    if (run({ type: 'POST_BOUNTY', bounty: kind, heroIds: picked })) {
      setKind(null)
      setPicked([])
    }
  }
  return (
    <div className="est-block">
      <h4 className="panel-sub">
        📜 {t('Bounty board')} · {e.bounties.length}/{BOUNTY.maxActive}
      </h4>
      <p className="muted small">{t('Fund a job and send heroes from the bench — not the party. They come back with stones, materials, experience, and now and then something rare.')}</p>
      {e.bounties.map((b) => (
        <div key={b.id} className="est-row">
          <div className="est-main">
            <b>{t(BOUNTIES[b.kind]?.name ?? b.kind)}</b>
            <div className="muted small">{b.heroIds.map((id) => shortName(state, id)).join(', ')}</div>
          </div>
          <span className="muted">⏳ {timeLeft(b.endsAt - nowWorld)}</span>
        </div>
      ))}
      {e.bounties.length < BOUNTY.maxActive && (
        <div className="est-kinds">
          {Object.values(BOUNTIES).map((b) => {
            const locked = state.tower.highestCleared < b.minFloor
            return (
              <button
                key={b.id}
                className={`est-kind ${kind === b.id ? 'sel' : ''}`}
                disabled={locked}
                onClick={() => {
                  setKind(kind === b.id ? null : b.id)
                  setPicked([])
                }}
                title={t(b.blurb)}
              >
                <b>{t(b.name)}</b>
                <span className="muted small">
                  {locked
                    ? t('Clear floor {n} first', { n: b.minFloor })
                    : b.heroes === 1
                      ? t('1 hero · {h} world-hours · {g} ◆', { h: Math.round(b.ms / 3_600_000), g: b.gold.toLocaleString() })
                      : t('{n} heroes · {h} world-hours · {g} ◆', { n: b.heroes, h: Math.round(b.ms / 3_600_000), g: b.gold.toLocaleString() })}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {def && (
        <>
          <div className="muted small">{t(def.blurb)}</div>
          {bench.length === 0 ? (
            <div className="lr-empty">{t('Nobody on the bench is free.')}</div>
          ) : (
            <div className="syn-row">
              {bench.map((h) => (
                <button key={h.id} type="button" className={`syn-chip ${picked.includes(h.id) ? 'sel' : ''}`} onClick={() => toggle(h.id)}>
                  <Portrait hero={h} size="sm" />
                  <span className="syn-chip-name">{first(h.name)}</span>
                </button>
              ))}
            </div>
          )}
          <button className="btn primary sm" disabled={bountyRefusal(state, def.id, picked) !== null} onClick={post}>
            {t('Post the bounty')} · {def.gold.toLocaleString()} ◆ ({picked.length}/{def.heroes})
          </button>
        </>
      )}
      {e.bountyLog.length > 0 && (
        <>
          <h4 className="panel-sub">{t('Came back')}</h4>
          {e.bountyLog.slice(0, 4).map((r) => (
            <div key={r.id} className="muted small est-log">
              <b>{t(BOUNTIES[r.kind]?.name ?? r.kind)}</b> — {r.heroIds.map((id) => shortName(state, id)).join(', ')}: {haulLine(r.materials, r.xp, r.item)}
            </div>
          ))}
        </>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tryout duels
// ─────────────────────────────────────────────────────────────────────────────

function DuelSection({ state, store }: { state: GameState; store: Store }) {
  const [err, setErr] = useState<string | null>(null)
  const [pair, setPair] = useState<HeroId[]>([])
  const [replay, setReplay] = useState<{ log: CombatLog; a: OwnedHero; b: OwnedHero } | null>(null)
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive && !h.captiveOf && !h.expedition)
  const [a, b] = pair
  const refusal = a && b ? duelRefusal(state, a, b) : null
  const toggle = (id: HeroId) => setPair((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1]!, id] : [...p, id]))
  const host = () => {
    if (!a || !b) return
    setErr(null)
    try {
      // Catch the clock up first, so the replay is exactly the bout the reducer resolves.
      const now = Date.now()
      store.dispatch({ type: 'TICK' }, now)
      const s = store.getState()!
      const log = duelBattle(s, a, b).log
      const ha = s.heroes[a]!
      const hb = s.heroes[b]!
      store.dispatch({ type: 'HOST_DUEL', a, b }, now)
      setReplay({ log, a: ha, b: hb })
      setPair([])
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'Action failed'))
    }
  }
  return (
    <div className="est-block">
      <h4 className="panel-sub">
        ⚔ {t('Tryout duels')} · {t('{n} left today', { n: duelsLeft(state, toWorldTime(Date.now())) })}
      </h4>
      <p className="muted small">{t('Pick two heroes to spar in the Yard. Nobody dies; both learn a little, the winner takes the purse — and rivals may come out respecting each other, or bitter.')}</p>
      <div className="syn-row">
        {living.map((h) => (
          <button key={h.id} type="button" className={`syn-chip ${pair.includes(h.id) ? 'sel' : ''}`} onClick={() => toggle(h.id)}>
            <Portrait hero={h} size="sm" />
            <span className="syn-chip-name">{first(h.name)}</span>
          </button>
        ))}
      </div>
      <button className="btn primary sm" disabled={!a || !b || refusal !== null} title={refusal ? t(refusal) : undefined} onClick={host}>
        {a && b ? t('{a} vs {b} · purse {g} ◆', { a: shortName(state, a), b: shortName(state, b), g: duelPurse(state, a, b).toLocaleString() }) : t('Choose two duellists')}
      </button>
      {refusal && a && b && <div className="muted small">{t(refusal)}</div>}
      {err && <div className="err">{err}</div>}
      {replay && <DuelScene state={state} {...replay} onDone={() => setReplay(null)} />}
    </div>
  )
}

/** A small replay of a duel: the two duellists face off, HP bars drain hit by hit. */
export function DuelScene({ state, log, a, b, onDone }: { state: GameState; log: CombatLog; a: OwnedHero; b: OwnedHero; onDone: () => void }) {
  const reduce = reducedMotion()
  const steps = useMemo(() => log.events.filter((e) => e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard' || e.kind === 'heal' || e.kind === 'panic'), [log])
  const [i, setI] = useState(reduce ? steps.length : 0)
  useEffect(() => {
    if (i >= steps.length) return
    const id = setTimeout(() => setI((n) => n + 1), 420)
    return () => clearTimeout(id)
  }, [i, steps.length])
  const maxHp = Object.fromEntries(log.unitsInit.map((u) => [u.id, u.maxHP]))
  const hp: Record<string, number> = { ...maxHp }
  for (const e of steps.slice(0, i)) {
    if (e.kind === 'hit') hp[e.targetId] = e.hpAfter
    if (e.kind === 'heal') hp[e.unitId] = e.hpAfter
  }
  const cur = i > 0 ? steps[i - 1] : undefined
  const done = i >= steps.length
  const last = state.estate?.duels?.last
  const winner = last && last.a === a.id && last.b === b.id ? last.winner : null
  const verdict = !done
    ? t('Round {n}', { n: i + 1 })
    : winner === a.id
      ? t('{name} wins the tryout!', { name: first(a.name) })
      : winner === b.id
        ? t('{name} wins the tryout!', { name: first(b.name) })
        : t('A draw — neither yields.')
  const mood = done && last ? (last.mood === 'respect' ? t('They clasp hands. Respect, grudging but real.') : last.mood === 'bitter' ? t('No handshake. This isn’t over.') : t('Laughing, they help each other up.')) : ''
  const actor = cur && 'actorId' in cur ? cur.actorId : null
  const fighter = (h: OwnedHero, dir: 'right' | 'left') => {
    const pct = Math.max(0, ((hp[h.id] ?? 0) / (maxHp[h.id] || 1)) * 100)
    const hurt = !done && cur?.kind === 'hit' && cur.targetId === h.id
    return (
      <div className={`duel-fighter ${actor === h.id ? 'acting' : ''} ${hurt ? 'hurt' : ''} ${done && winner && winner !== h.id ? 'down' : ''}`}>
        <div className="duel-name">{first(h.name)}</div>
        <div className="duel-hp">
          <span style={{ width: `${pct}%` }} />
        </div>
        <img className="px duel-sprite" src={heroFrameUrl(h, dir, actor === h.id ? 1 : 0)} width={48} height={64} alt="" />
        {hurt && cur?.kind === 'hit' && <span className={`duel-pop ${cur.crit ? 'crit' : ''}`}>{cur.amount}</span>}
        {!done && cur?.kind === 'miss' && cur.targetId === h.id && <span className="duel-pop miss">{t('miss')}</span>}
      </div>
    )
  }
  return (
    <PixelWindow title={t('Tryout duel')} icon="⚔" onClose={onDone}>
      <div className="duel-stage">
        {fighter(a, 'right')}
        <div className="duel-vs">VS</div>
        {fighter(b, 'left')}
      </div>
      <p className="duel-caption">{verdict}</p>
      {mood && <p className="muted duel-caption">{mood}</p>}
      <div className="duel-foot">
        {!done && (
          <button className="btn sm ghost" onClick={() => setI(steps.length)}>
            {t('Skip')} ⏩
          </button>
        )}
        {done && (
          <button className="btn sm primary" onClick={onDone}>
            {t('Back to the yard')}
          </button>
        )}
      </div>
    </PixelWindow>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Paid drill refocus
// ─────────────────────────────────────────────────────────────────────────────

function RefocusSection({ state, store }: { state: GameState; store: Store }) {
  const [err, run] = useRun(store)
  const [heroId, setHeroId] = useState<HeroId | null>(null)
  const drilling = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive && h.training)
  if (drilling.length === 0) return null
  const hero = heroId ? state.heroes[heroId] : null
  return (
    <div className="est-block">
      <h4 className="panel-sub">🎯 {t('Refocus a drill')}</h4>
      <p className="muted small">{t('Pay the drill-master to switch a running drill to another skill. The time already spent is kept.')}</p>
      <div className="syn-row">
        {drilling.map((h) => (
          <button key={h.id} type="button" className={`syn-chip ${heroId === h.id ? 'sel' : ''}`} onClick={() => setHeroId(heroId === h.id ? null : h.id)}>
            <Portrait hero={h} size="sm" />
            <span className="syn-chip-name">{first(h.name)}</span>
          </button>
        ))}
      </div>
      {hero?.training && (
        <div className="drill-list">
          <div className="muted small">{t('Now: {skill}', { skill: t(SKILLS[hero.training.skillId]?.name ?? '') })}</div>
          {trainingOptions({ ...state, heroes: { ...state.heroes, [hero.id]: { ...hero, training: null } } }, hero.id)
            .filter((o) => o.skillId !== hero.training!.skillId)
            .map((o) => {
              const reason = refocusRefusal(state, hero.id, o.skillId)
              return (
                <div key={o.skillId} className={`drill-row ${reason ? 'off' : ''}`} title={reason ? t(reason) : undefined}>
                  <span className="skill-grade">{SKILLS[o.skillId]!.grade}</span>
                  <span className="drill-name">
                    {o.mode === 'learn' ? t('Learn') : t('Refine')} {t(SKILLS[o.skillId]!.name)}
                  </span>
                  <span className="muted">{refocusCost(o.skillId, o.mode).toLocaleString()} ◆</span>
                  <button className="btn sm" disabled={reason !== null} onClick={() => run({ type: 'REFOCUS_DRILL', heroId: hero.id, skillId: o.skillId })}>
                    {t('Refocus')}
                  </button>
                </div>
              )
            })}
        </div>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile notes (trauma, favoritism, meaning)
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY: Record<string, string> = {
  sweets: 'sweets',
  flowers: 'flowers',
  books: 'old books',
  wine: 'good wine',
  arms: 'fine steel',
  trinkets: 'little trinkets',
}

/** What the estate knows about a hero's state of mind (for the profile). */
export function heroEstateNotes(state: GameState, hero: OwnedHero): string[] {
  const out: string[] = []
  const now = state.meta.lastSeenAtWorld
  const tr = traumaOf(state, hero.id)
  if (tr.withdrawn) {
    out.push(
      tr.withdrawn.cause
        ? t('Withdrawn since losing {name}. Talk to them each day, give a gift, or raise a statue for {name}.', { name: shortName(state, tr.withdrawn.cause) })
        : t('Withdrawn after long despair. Talk to them each day, or give a gift.'),
    )
  }
  if (isBurntOut(state, hero.id)) out.push(t('Burnt out: refuses the tower ({m}).', { m: timeLeft((tr.burnoutUntil ?? now) - now) }))
  else if (tr.veteran) out.push(t('A burnt-out veteran: teaches half again as well as an Instructor.'))
  const f = Math.round(fatigueAt(tr, now))
  if (f >= 3 && !isBurntOut(state, hero.id)) out.push(t('Tired: {n} floors without rest.', { n: f }))
  const envy = state.estate?.jealous?.[hero.id]
  if (envy) out.push(t('Feels overlooked — you keep choosing {name}.', { name: shortName(state, envy) }))
  else if (favouriteOf(state, worldDay(now)) === hero.id) out.push(t('Your favourite lately — the others have noticed.'))
  for (const m of giftMeanings(state, hero.id)) {
    out.push(
      m.weight === 2
        ? t('{what} mean something now — {name} loved them.', { what: t(CATEGORY[m.category] ?? m.category), name: shortName(state, m.because) })
        : t('Has come to like {what}, like {name} does.', { what: t(CATEGORY[m.category] ?? m.category), name: shortName(state, m.because) }),
    )
  }
  const b = state.estate?.bounties?.find((x) => x.heroIds.includes(hero.id))
  if (b) out.push(t('Out on a bounty: {name}', { name: t(BOUNTIES[b.kind]?.name ?? b.kind) }))
  return out
}

export function EstateNotes({ state, hero }: { state: GameState; hero: OwnedHero }) {
  const notes = heroEstateNotes(state, hero)
  if (notes.length === 0) return null
  return (
    <div className="est-notes">
      {notes.map((n, i) => (
        <div key={i} className="small">
          • {n}
        </div>
      ))}
    </div>
  )
}

