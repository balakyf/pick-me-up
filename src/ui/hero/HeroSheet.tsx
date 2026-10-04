/**
 * The hero sheet (lane N, pillar 2: heroes are people, not stat blocks). One window for one
 * hero, wherever "a hero" is opened — the Registry, the Party Board, the tracker, the
 * lobby, every facility picker and the Armory:
 *
 *   Overview — bust, stars, class, trait, morale and its reasons, life (job, friends, mood),
 *              engraving, gifts.
 *   Stats    — level and XP, true CP, growth grades and bases, every combat stat (gear's part).
 *   Skills   — levels, XP, the merges a hero is working toward (on their own or early).
 *   Gear     — slots, compare, equip/unequip, equip best (GearPanel).
 *   Story    — the life before the summon, temperament, memories, chronicle, and for the
 *              fallen their grave and last words.
 *
 * It replaces the lobby's profile window and the Registry's expanded card; every piece is
 * the existing component or helper (MoraleBreakdown, TraitBadge, JobPicker, memoryLine,
 * chronicleLine, HeroBond, …), not a fork.
 */
import { useState, type KeyboardEvent } from 'react'
import type { GameState, HeroId, OwnedHero, Star } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { SKILLS, SKILL_MERGES } from '../../engine/content'
import { maxLevelFor } from '../../engine/skills'
import { XP_TO_NEXT, levelCapForStar } from '../../engine/stats'
import { equipmentBonus, combatSubstats } from '../../engine/equipment'
import { favorTierName } from '../../engine/favor'
import { shownStar } from '../../engine/shop'
import { canPromote, promotionTargetStar } from '../../engine/promotion'
import { fuseOptions } from '../../engine/transfer'
import { practiceFocus } from '../../engine/training'
import { TIER_NAMES, bondOf, dayOfSlot, jobTier, lifeOf, personalityOf, relationsOf, salientMemories } from '../../engine/life'
import { heroCpFull } from '../../engine/unit/trueCp'
import { PixelWindow, Gauge } from '../kit'
import { ClassBadge, ElementBadge, EngravingBadge, STAR_COLOR, Stars, gradeLetters, statsOf } from '../bits'
import { heroBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { TraitBadge } from '../people/TraitBadge'
import { BondBadge, BondList } from '../bond/BondBadge'
import { HeroBond } from '../metaPanels'
import { MoralePips, MoraleBreakdown } from '../life/MoralePips'
import { EstateNotes } from '../life/EstatePanels'
import { JOB_ICON, JobPicker, PERSONALITY_TRAITS, memoryLine } from '../life/lifeWindows'
import { JOB_NAME, accountDay, chronicleLine, lastWords, shortName, speak, statusLine, tradeName } from '../life/speech'
import { roleLabel, skillBlurb, skillRole } from '../skillText'
import { ENGRAVINGS } from '../../engine/content'
import { ta } from '../text'
import { bornTrade } from './heroLabel'
import { GearPanel } from './GearPanel'
import { SHEET_TABS, openHeroSheet, openPromotionPlanner, type SheetTab } from './sheetBus'
import { STAT_LABEL } from '../facilities/gearText'
import './hero.css'

const TAB_LABEL: Record<SheetTab, string> = {
  overview: 'Overview',
  stats: 'Stats',
  skills: 'Skills',
  gear: 'Gear',
  story: 'Story',
}

const BOND_LABEL: Record<string, string> = {
  closeFriend: 'Close friend',
  friend: 'Friend',
  rival: 'Rival',
  grudge: 'Grudge',
}

export function HeroSheet({
  state,
  store,
  heroId,
  tab: tab0 = 'overview',
  onClose,
  onFind,
}: {
  state: GameState
  store: Store
  heroId: string
  tab?: SheetTab
  onClose: () => void
  /** The lobby's camera: follow the hero (absent off the lobby). */
  onFind?: (id: string) => void
}) {
  const [tab, setTab] = useState<SheetTab>(tab0)
  const hero = state.heroes[heroId as HeroId]
  if (!hero) return null
  const star = shownStar(hero, state.meta.masterLevel) as Star
  const cap = levelCapForStar(hero.star)

  function tabKeys(e: KeyboardEvent) {
    const i = SHEET_TABS.indexOf(tab)
    if (e.key === 'ArrowRight') setTab(SHEET_TABS[(i + 1) % SHEET_TABS.length]!)
    else if (e.key === 'ArrowLeft') setTab(SHEET_TABS[(i + SHEET_TABS.length - 1) % SHEET_TABS.length]!)
    else return
    e.preventDefault()
  }

  return (
    <PixelWindow title={hero.name} icon="✦" onClose={onClose} wide>
      <div className={`hs ${hero.alive ? '' : 'dead'}`}>
        <div className="hs-head">
          <img className="px hs-bust" src={heroBustUrl(hero)} width={72} height={72} alt="" style={{ borderColor: STAR_COLOR[star] }} />
          <div className="hs-id">
            <div className="hs-line">
              <Stars star={star} />
              <span className="muted">
                {t('Lv {level}', { level: hero.xp.level })}
                <span style={{ opacity: 0.6 }}>/{cap}</span>
              </span>
              <span className="cp">
                <span className="lab">{t('CP')} </span>
                {heroCpFull(state, hero).toLocaleString()}
              </span>
            </div>
            <div className="hs-line">
              <ClassBadge heroClass={hero.heroClass} trade={bornTrade(hero)} />
              <ElementBadge element={hero.element} />
              {hero.alive && (
                <span className="favor-chip" title={t('Favorability {n}/100', { n: hero.favor })}>
                  ♥ {t(favorTierName(hero.favor))}
                </span>
              )}
              {hero.alive ? <MoralePips state={state} heroId={hero.id} label /> : <span className="hs-fallen">{t('☠ Fallen')}</span>}
            </div>
            {hero.alive && <div className="muted small">{statusLine(state, hero)}</div>}
          </div>
          <div className="hs-actions">
            {onFind && hero.alive && (
              <button type="button" className="pbtn sm" onClick={() => onFind(hero.id)} title={t('Follow with the camera')}>
                👁 {t('Find on the map')}
              </button>
            )}
            {canPromote(hero) && (
              <button type="button" className="pbtn sm gold" onClick={() => openPromotionPlanner(hero.id)}>
                ⬆ {t('Promote to {n}★…', { n: promotionTargetStar(hero) })}
              </button>
            )}
          </div>
        </div>

        <div className="hs-tabs" role="tablist" aria-label={t('Hero sheet')} onKeyDown={tabKeys}>
          {SHEET_TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`hs-tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`hs-panel-${k}`}
              tabIndex={tab === k ? 0 : -1}
              className={`hs-tab ${tab === k ? 'on' : ''}`}
              onClick={() => setTab(k)}
            >
              {t(TAB_LABEL[k])}
            </button>
          ))}
        </div>

        <div className="hs-panel" role="tabpanel" id={`hs-panel-${tab}`} aria-labelledby={`hs-tab-${tab}`}>
          {tab === 'overview' && <Overview state={state} store={store} hero={hero} onFind={onFind} />}
          {tab === 'stats' && <StatsTab state={state} hero={hero} />}
          {tab === 'skills' && <SkillsTab state={state} hero={hero} />}
          {tab === 'gear' && <GearTab state={state} store={store} hero={hero} />}
          {tab === 'story' && <StoryTab state={state} hero={hero} />}
        </div>
      </div>
    </PixelWindow>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────

function Overview({ state, store, hero, onFind }: { state: GameState; store: Store; hero: OwnedHero; onFind?: (id: string) => void }) {
  const life = lifeOf(hero)
  const job = life.job
  const tier = job ? jobTier(life.jobXp[job] ?? 0) : 0
  const inParty = state.party.slots.includes(hero.id)
  const rels = relationsOf(state, hero.id)
    .filter(([o, r]) => bondOf(r.affinity) && (state.heroes[o]?.alive ?? false))
    .slice(0, 8)
  // A friend's name finds them on the map in the lobby, else opens their sheet.
  const find = onFind ?? ((id: string) => openHeroSheet(id))
  return (
    <div className="hs-overview">
      <div className="hs-cols">
        <div>
          <TraitBadge hero={hero} full />
          <EngravingBadge hero={hero} />
          {hero.engraving && ENGRAVINGS[hero.engraving.id] && <div className="muted small">{t(ENGRAVINGS[hero.engraving.id]!.blurb)}</div>}
          <BondBadge hero={hero} />
          {hero.alive && (
            <>
              <h4 className="panel-sub">{t('Morale')}</h4>
              <MoraleBreakdown state={state} heroId={hero.id} />
            </>
          )}
        </div>
        <div>
          {hero.alive && (
            <>
              <div className="profile-now">“{speak(state, hero, inParty, 'profile')}”</div>
              <EstateNotes state={state} hero={hero} />
              <h4 className="panel-sub">{t('Mood')}</h4>
              {(['energy', 'hunger', 'social', 'fun'] as const).map((k) => (
                <div key={k} className="trait-row">
                  <span>{t(k === 'hunger' ? 'Fed' : k[0]!.toUpperCase() + k.slice(1))}</span>
                  <Gauge pct={life.needs[k]} color={life.needs[k] < 25 ? 'var(--bad)' : life.needs[k] < 55 ? 'var(--warn)' : 'var(--good)'} />
                </div>
              ))}
              {life.grief > 0 && (
                <div className="trait-row">
                  <span>{t('Grief')}</span>
                  <Gauge pct={life.grief} color="#8a7ad8" />
                </div>
              )}
            </>
          )}
          <h4 className="panel-sub">{t('Friends')}</h4>
          {rels.length === 0 && <div className="muted">{t('Keeps to themselves, so far.')}</div>}
          {rels.map(([o, r]) => (
            <div key={o} className="rel-row">
              <button type="button" className="linkish" onClick={() => find(o)}>
                {shortName(state, o)}
              </button>
              <span className={`chip bond-${bondOf(r.affinity)}`}>{t(BOND_LABEL[bondOf(r.affinity)!]!)}</span>
              {r.shared > 0 && <span className="muted small">{t('{n} floors together', { n: r.shared })}</span>}
            </div>
          ))}
          <BondList state={state} hero={hero} onFind={find} />
        </div>
      </div>
      {hero.alive && (
        <>
          <h4 className="panel-sub">
            {t('Job')}
            {job ? ` · ${JOB_ICON[job]} ${t(TIER_NAMES[tier]!)} ${t(JOB_NAME[job])}` : ` · ${t('none')}`}
          </h4>
          <details className="hs-more">
            <summary>{t('Change their job')}</summary>
            <JobPicker state={state} store={store} hero={hero} />
          </details>
          <details className="hs-more">
            <summary>{t('Favor and gifts')}</summary>
            <HeroBond hero={hero} state={state} store={store} />
          </details>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

const ATTRS = [
  ['STR', 'str'],
  ['AGI', 'agi'],
  ['VIT', 'vit'],
  ['INT', 'int'],
  ['WIL', 'wil'],
] as const

const STAT_ROWS = ['maxHP', 'pAtk', 'mAtk', 'pDef', 'mDef', 'spd', 'critPct', 'statusRes'] as const

export function StatsTab({ state, hero }: { state: GameState; hero: OwnedHero }) {
  const cap = levelCapForStar(hero.star)
  const need = XP_TO_NEXT[hero.xp.level - 1] ?? 0
  const pct = need > 0 ? Math.min(100, (hero.xp.xpIntoLevel / need) * 100) : 100
  const stats = statsOf(hero, state)
  const gear = combatSubstats(equipmentBonus(hero, state.inventory).stats)
  const cp = heroCpFull(state, hero)
  const bare = heroCpFull({ ...state, inventory: [] }, hero)
  const grades = gradeLetters(hero)
  return (
    <div className="hs-stats">
      <div className="hs-cols">
        <div>
          <h4 className="panel-sub">{t('Level')}</h4>
          <div className="hs-xp">
            <span>
              {t('Lv {level}', { level: hero.xp.level })} / {cap}
            </span>
            <span className="hs-bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="muted small">{hero.xp.atCap ? t('At the level cap') : t('{n} / {m} XP', { n: hero.xp.xpIntoLevel.toLocaleString(), m: need.toLocaleString() })}</span>
          </div>
          {hero.xp.atCap && hero.xp.heldXp > 0 && (
            <div className="muted small">{t('{n} XP held until the next promotion.', { n: hero.xp.heldXp.toLocaleString() })}</div>
          )}
          <h4 className="panel-sub">{t('True CP')}</h4>
          <div className="hs-cp">
            <span className="cp">{cp.toLocaleString()}</span>
            <span className="muted small">
              {t('{n} from gear', { n: (cp - bare).toLocaleString() })} · {t('gear, passives, engraving, favor, Sanity and morale included')}
            </span>
          </div>
          <h4 className="panel-sub">{t('Growth grades')}</h4>
          <table className="hs-table">
            <thead>
              <tr>
                <th>{t('Attribute')}</th>
                <th>{t('Grade')}</th>
                <th>{t('Base')}</th>
              </tr>
            </thead>
            <tbody>
              {ATTRS.map(([label, k]) => (
                <tr key={k}>
                  <td>{t(label)}</td>
                  <td className={`hs-grade g-${grades[label]}`}>{grades[label]}</td>
                  <td>{hero.baseAttrs[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4 className="panel-sub">{t('In battle')}</h4>
          <table className="hs-table">
            <thead>
              <tr>
                <th>{t('Stat')}</th>
                <th>{t('Total')}</th>
                <th>{t('Gear')}</th>
              </tr>
            </thead>
            <tbody>
              {STAT_ROWS.map((k) => {
                const pctKey = k === 'critPct' || k === 'statusRes'
                const g = gear[k] ?? 0
                return (
                  <tr key={k}>
                    <td>{t(STAT_LABEL[k])}</td>
                    <td>
                      {Math.round(stats[k])}
                      {pctKey ? '%' : ''}
                    </td>
                    <td className={g > 0 ? 'up' : 'muted'}>{g > 0 ? `+${g}${pctKey ? '%' : ''}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────────────────────────────────────

export function SkillsTab({ state, hero }: { state: GameState; hero: OwnedHero }) {
  const held = new Map(hero.skills.map((s) => [s.id, s]))
  const merges = SKILL_MERGES.filter((m) => m.inputs.some((id) => held.has(id)) && !held.has(m.result))
  const early = hero.alive ? fuseOptions(state, hero.id) : []
  const focus = hero.alive ? practiceFocus(hero, state.facilities.trainingCenter.level) : null
  return (
    <div className="hs-skills">
      {hero.skills.length === 0 && <div className="lr-empty">{t('No skills yet')}</div>}
      <ul className="hs-skill-list">
        {hero.skills.map((s) => {
          const def = SKILLS[s.id]
          if (!def) return null
          const max = maxLevelFor(def.grade)
          const need = TUNING.skills.xpToNext[s.level] ?? 0
          const pct = s.level >= max ? 100 : need > 0 ? Math.min(100, (s.xp / need) * 100) : 0
          const role = skillRole(def)
          return (
            <li key={s.id} className={`hs-skill grade-${def.grade}`}>
              <div className="hs-skill-top">
                <span className="skill-grade">{def.grade}</span>
                <b>{t(def.name)}</b>
                <span className="muted small">{t('Lv {n}/{m}', { n: s.level, m: max })}</span>
                {def.passive && <span className="chip">{t('passive')}</span>}
                {def.bound && <span className="chip">✦ {t('bound')}</span>}
                <span className={`skill-role role-${role}`}>{roleLabel(role)}</span>
              </div>
              <span className="hs-bar" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </span>
              <div className="muted small">
                {s.level >= max ? t('Mastered') : t('{n} / {m} skill XP to Lv {next}', { n: s.xp, m: need, next: s.level + 1 })}
                {focus?.skillId === s.id && ` · ${t('practising it in their free time')}`}
              </div>
              <div className="skill-blurb">{skillBlurb(def, s.level)}</div>
            </li>
          )
        })}
      </ul>
      {focus && focus.mode === 'learn' && SKILLS[focus.skillId] && (
        <div className="muted small">{t('Learning {skill} in the yard, on their own.', { skill: t(SKILLS[focus.skillId]!.name) })}</div>
      )}
      <h4 className="panel-sub">{t('Merges')}</h4>
      {merges.length === 0 && early.length === 0 && <div className="muted">{t('No merge uses this hero’s skills yet.')}</div>}
      {merges.map((m) => {
        const ready = m.inputs.every((id) => (held.get(id)?.level ?? 0) >= m.minLevel)
        return (
          <div key={m.result} className={`hs-merge ${ready ? 'ready' : ''}`}>
            {m.inputs.map((id, i) => {
              const s = held.get(id)
              return (
                <span key={id}>
                  {i > 0 && ' + '}
                  <span className={s ? '' : 'muted'}>
                    {t(SKILLS[id]?.name ?? id)} {s ? t('Lv {n}', { n: s.level }) : t('(missing)')}
                  </span>
                </span>
              )
            })}{' '}
            → <b>{t(SKILLS[m.result]?.name ?? m.result)}</b>{' '}
            <span className="muted small">{t('merges on its own when both reach Lv {n}', { n: m.minLevel })}</span>
          </div>
        )
      })}
      {early.length > 0 && (
        <>
          <div className="muted small">{t('At the Transfer Station, early:')}</div>
          {early.map((o) => (
            <div key={o.result} className={`hs-merge ${o.ok ? 'ready' : ''}`} title={o.reason ? t(o.reason) : undefined}>
              {o.kind === 'evolve' ? t('Evolve') : t('Fuse')} {o.inputs.map((i) => t(SKILLS[i]?.name ?? i)).join(' + ')} → <b>{t(SKILLS[o.result]?.name ?? o.result)}</b>{' '}
              <span className="muted small">
                {o.cost.toLocaleString()} ◆{o.ok ? ` · ${t('possible now')}` : o.reason ? ` · ${t(o.reason)}` : ''}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Gear
// ─────────────────────────────────────────────────────────────────────────────

function GearTab({ state, store, hero }: { state: GameState; store: Store; hero: OwnedHero }) {
  const grave = hero.alive ? null : state.life.memorial.find((g) => g.heroId === hero.id) ?? null
  return (
    <div className="hs-gear">
      <GearPanel state={state} store={store} hero={hero} />
      {grave?.carried && grave.carried.length > 0 && (
        <>
          <h4 className="panel-sub">{t('What they carried at the end')}</h4>
          {grave.carried.map((c) => {
            const now = state.inventory.find((i) => i.id === c.itemId)
            const wearer = now ? Object.values(state.heroes).find((h) => h.alive && Object.values(h.equipment).includes(c.itemId)) : undefined
            return (
              <div key={c.itemId} className="muted small">
                {c.grade} {c.name} — {wearer ? t('carried on by {name}', { name: wearer.name }) : now ? t('waiting in the Armory') : t('lost since')}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Story
// ─────────────────────────────────────────────────────────────────────────────

export function StoryTab({ state, hero }: { state: GameState; hero: OwnedHero }) {
  const p = personalityOf(hero)
  const life = lifeOf(hero)
  const today = dayOfSlot(state.life.slot)
  const memories = salientMemories(life, today).slice(0, 12)
  const chronicle = state.life.chronicle.filter((e) => e.heroIds.includes(hero.id)).slice(-12).reverse()
  const grave = hero.alive ? null : state.life.memorial.find((g) => g.heroId === hero.id) ?? null
  return (
    <div className="hs-story">
      {grave && (
        <div className="hs-grave">
          <div>
            {grave.cause === 'synthesis'
              ? t('Lost to the Synthesis Chamber')
              : grave.cause === 'captor'
                ? t('Never ransomed')
                : t('Fell on floor {n}', { n: grave.floor })}{' '}
            · {t('day {n}', { n: accountDay(state, grave.day) })} · {t('served {n} days', { n: grave.daysServed })}
          </div>
          <div className="last-words">“{lastWords(state, grave)}”</div>
          {grave.mourners.length > 0 && <div className="muted small">{t('mourned by {names}', { names: grave.mourners.map((m) => shortName(state, m)).join(', ') })}</div>}
        </div>
      )}
      <div className="hs-cols">
        <div>
          <h4 className="panel-sub">{t('Before the summon')}</h4>
          <div>{ta('Was a {trade} in their old life.', { trade: tradeName(p.background) })}</div>
          <div className="muted">
            {t('Voice: {v}', { v: t(p.voice) })} · {t(p.chronotype === 'owl' ? 'Night owl' : p.chronotype === 'early' ? 'Early riser' : 'Keeps normal hours')}
          </div>
          <div className="muted">
            {t('Loves {food}', { food: t(p.food) })} · {t('Hobby: {h}', { h: t(p.hobby) })}
          </div>
          <div className="muted">
            {hero.origin === 'cameo' ? t('A face from the stories.') + ' ' : ''}
            {t('Here since day {n}', { n: accountDay(state, life.arrivedDay) })}
          </div>
          <h4 className="panel-sub">{t('Temperament')}</h4>
          {PERSONALITY_TRAITS.map(([k, label]) => (
            <div key={k} className="trait-row">
              <span>{t(label)}</span>
              <Gauge pct={(p[k] as number) * 100} color="var(--accent-2)" />
            </div>
          ))}
        </div>
        <div>
          <h4 className="panel-sub">{t('Memories')}</h4>
          {memories.length === 0 && <div className="muted">{t('Nothing to remember yet.')}</div>}
          {memories.map((m, i) => (
            <div key={i} className="mem-row small">
              {memoryLine(state, m)}
            </div>
          ))}
          <h4 className="panel-sub">{t('Chronicle')}</h4>
          {chronicle.length === 0 && <div className="muted">{t('Nothing written down yet.')}</div>}
          {chronicle.map((e, i) => (
            <div key={i} className="mem-row small">
              {chronicleLine(state, e)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
