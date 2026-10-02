/**
 * The summon reveal: one hero at a time. The circle wakes, a pillar of light rises in
 * the rarity's colour (a rare pull starts one colour humbler and surges — the tease), a
 * burst, and the card turns over. "Rare" is relative to the pool: 4★+ on the Advanced
 * pool, the 3★ jackpot on the Normal one. Click / Space / Enter advances; Skip (or Esc)
 * jumps to the lineup; "Skip to best" stops on the next rare pull. It ends on a lineup of
 * everyone new, best first, with the ways onward (Party Board, Registry, summon again).
 *
 * Reveal 2.0 (lane J) — you summon a person, not a stat block:
 *   - a ten-pull opens on ten orbs, each in its beam's opening colour (a rare one teased);
 *   - 1–2★ flip fast; 3★+ get the full beat;
 *   - the card says who they were (their trade before the summon) and greets the Master in
 *     their own voice; its second beat stamps what they brought — the engraving seal, the
 *     Oath-weapon, their skills, their innate trait, their best grade ('S-grade STR!') and,
 *     when the Rising Quality Floor lifted them, the floor's own stamp;
 *   - each hero steps out of the light as a full-body sprite; a canon cameo gets a gilded
 *     frame and a fanfare;
 *   - a pity meter keeps count, and the lineup gathers a new bond group under its name.
 *
 * Cosmetic only: the SUMMON command has already resolved and saved before this mounts.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import type { BondGroup, EquipmentItem, GameState, OwnedHero, Star } from '../../engine/types'
import { shownStar } from '../../engine/shop'
import { ENGRAVINGS, SKILLS } from '../../engine/content'
import { traitOf } from '../../engine/content/traits'
import { TUNING } from '../../engine/tuning'
import { personalityOf } from '../../engine/life'
import { sfx } from '../audio/sound'
import { useMusic } from '../audio/useSound'
import { reducedMotion } from '../motion'
import { ClassBadge, ClassIcon, ElementBadge, ElementIcon, ELEMENT_VIS, Stars, STAR_COLOR } from '../bits'
import { heroBustUrl, heroFrameUrl } from '../pixel/sprites'
import { cachedDataUrl } from '../pixel/render'
import { drawSummonCircle } from '../pixel/summonFx'
import { drawProp } from '../pixel/props'
import { scale } from '../pixel/bitmap'
import { t } from '../i18n/i18n'
import { bornTrade } from '../hero/heroLabel'
import { greeting } from '../life/speech'
import { bondLabel } from '../bond/BondBadge'
import { itemLabel } from '../facilities/Armory'
import { TraitChip } from '../people/TraitBadge'
import {
  TIER_TINT,
  beamSteps,
  bestGrade,
  cardStamps,
  flipAt,
  floorHits,
  gradeShout,
  isFastBeat,
  lineupGroups,
  lineupOrder,
  moteCount,
  motePlacement,
  nextBestIndex,
  orbTier,
  overviewHold,
  overviewOrbs,
  rareAtFor,
  rarityWordKey,
  stampDelay,
  stampStagger,
  surgeTimes,
  tierOf,
  type Stamp,
  type Tier,
} from './revealPlan'
import './summon.css'
import './reveal2.css'
import '../people/people.css'

export interface RevealAgain {
  label: string
  disabled: boolean
  onClick: () => void
}

type Gacha = GameState['gacha']

interface Props {
  heroes: OwnedHero[]
  masterLevel: number
  /** The pool pulled from: its top is its jackpot (the Normal pool's 3★ gets the tease). */
  pool?: 'normal' | 'advanced'
  /** Back to the summon screen. */
  onClose: () => void
  /** Leave for another scene (the lineup's Party Board / Registry buttons). */
  onNavigate?: (view: 'party' | 'roster') => void
  /** Summon again with the same pool and count. */
  again?: RevealAgain
  /** The pity counters before the pull (to stamp the pull the quality floor lifted). */
  pityBefore?: Gacha
  /** …and after it (the pity meter). */
  pityAfter?: Gacha
  /** The account's bond groups (the lineup gathers a new group under its name). */
  bondGroups?: Record<string, BondGroup>
  /** The account's items (a 4★+ arrives with an Oath-weapon). */
  items?: readonly EquipmentItem[]
}

type Phase = 'overview' | 'beam' | 'card' | 'lineup'

function circleUrl(tint: string): string {
  return cachedDataUrl(`circle|${tint}`, () => scale(drawSummonCircle(tint), 4))
}

function vars(v: Record<string, string>): CSSProperties {
  return v as CSSProperties
}

export function SummonReveal({ heroes, masterLevel, pool = 'advanced', onClose, onNavigate, again, pityBefore, pityAfter, bondGroups, items }: Props) {
  const reduced = useMemo(reducedMotion, [])
  const rareAt = rareAtFor(pool)
  const stars = useMemo(() => heroes.map((h) => shownStar(h, masterLevel)), [heroes, masterLevel])
  const lifted = useMemo(
    () => (pityBefore ? floorHits(pool, pityBefore, heroes.map((h) => h.star)) : heroes.map(() => false)),
    [pityBefore, pool, heroes],
  )
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>(heroes.length > 1 ? 'overview' : 'beam')
  const [step, setStep] = useState(0)
  const [stamped, setStamped] = useState(false)

  const star = stars[idx] ?? 1
  const steps = beamSteps(star, reduced, rareAt)
  // While the beam rises it may still be teasing; once the card turns, it shows the truth
  // (a click that skips the beam must not leave a 4★ card in the 3★ blue).
  const tier: Tier = phase === 'card' ? tierOf(star) : steps[Math.min(step, steps.length - 1)]!
  // The chamber's music rises with the beam: each tier adds a layer, gold all of them; the
  // overview and the lineup keep the best pull's (lane H's hook).
  const best = Math.max(0, ...stars.map(tierOf))
  useMusic({ scene: 'summon', tier: phase === 'lineup' ? best : phase === 'overview' ? 1 : tier })

  const flip = useCallback(() => {
    setPhase('card')
    setStamped(false)
    const s = stars[idx] ?? 1
    sfx(s >= 5 ? 'legend' : s >= rareAt ? 'rare' : s === 3 ? 'levelup' : 'flip')
    // A face from the stories: a fanfare on top.
    if (heroes[idx]?.origin === 'cameo') sfx('victory', { at: 0.25, gain: 0.8 })
  }, [idx, stars, rareAt, heroes])

  // The ten-pull overview holds a moment, then the first beam rises.
  useEffect(() => {
    if (phase !== 'overview') return
    sfx('summon')
    const id = setTimeout(() => setPhase('beam'), overviewHold(reduced))
    return () => clearTimeout(id)
  }, [phase, reduced])

  // One hero's beat: charge → (surges) → burst → flip.
  useEffect(() => {
    if (phase !== 'beam') return
    setStep(0)
    sfx('charge')
    const s = stars[idx] ?? 1
    const timers = surgeTimes(s, reduced, rareAt).map((at, i) =>
      setTimeout(() => {
        setStep(i + 1)
        sfx('surge')
      }, at),
    )
    timers.push(setTimeout(flip, flipAt(s, reduced, rareAt)))
    return () => timers.forEach(clearTimeout)
  }, [idx, phase, stars, reduced, flip, rareAt])

  // The card's second beat: the stamps land.
  useEffect(() => {
    if (phase !== 'card' || stamped) return
    const id = setTimeout(() => setStamped(true), stampDelay(stars[idx] ?? 1, reduced))
    return () => clearTimeout(id)
  }, [phase, stamped, idx, stars, reduced])

  const advance = useCallback(() => {
    if (phase === 'overview') setPhase('beam')
    else if (phase === 'beam') flip()
    else if (phase === 'card') {
      if (!stamped) {
        setStamped(true)
        return
      }
      if (idx + 1 < heroes.length) {
        setIdx(idx + 1)
        setStep(0)
        setPhase('beam')
      } else setPhase('lineup')
    }
  }, [phase, idx, heroes.length, flip, stamped])

  const skipAll = useCallback(() => setPhase('lineup'), [])

  const skipToBest = useCallback(() => {
    const from = phase === 'card' ? idx + 1 : phase === 'overview' ? 0 : idx
    const bestAt = nextBestIndex(stars, from, rareAt)
    if (bestAt < 0) setPhase('lineup')
    else if (bestAt !== idx || phase !== 'beam') {
      setIdx(bestAt)
      setStep(0)
      setPhase('beam')
    }
  }, [stars, phase, idx, rareAt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'lineup') {
        if (e.key === 'Escape') onClose()
        return
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        advance()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        skipAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, advance, skipAll, onClose])

  const hasBestAhead = nextBestIndex(stars, phase === 'card' ? idx + 1 : phase === 'overview' ? 0 : idx, rareAt) >= 0
  // Buttons must not keep focus, or Space would press them instead of advancing.
  const press = (fn: () => void) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.currentTarget.blur()
    fn()
  }

  if (phase === 'lineup') {
    return (
      <div className={`sr ${reduced ? 'sr-calm' : ''}`} role="dialog" aria-label={t('Your new heroes')}>
        <Lineup heroes={heroes} stars={stars} rareAt={rareAt} bondGroups={bondGroups} onClose={onClose} onNavigate={onNavigate} again={again} press={press} />
      </div>
    )
  }

  const meter = pityAfter ? <PityMeter pool={pool} gacha={pityAfter} /> : null

  if (phase === 'overview') {
    const orbs = overviewOrbs(stars, reduced, rareAt)
    return (
      <div className={`sr ${reduced ? 'sr-calm' : ''}`} role="dialog" aria-label={t('Mobius Summon')} onClick={advance}>
        <div className="sr-overview">
          <h3>{t('{n} lights answer the call', { n: heroes.length })}</h3>
          <div className="sr-orbs big" aria-hidden>
            {orbs.map((o, i) => (
              <span key={i} className={`sr-orb ${o.tease ? 'tease' : ''}`} style={vars({ '--tint': TIER_TINT[o.tier], animationDelay: `${i * 0.07}s` })} />
            ))}
          </div>
          <div className="sr-overview-hint">{orbs.some((o) => o.tease) ? t('Something stirs in the light…') : t('Click to reveal')}</div>
        </div>
        {meter}
        <div className="sr-controls">
          <button className="btn sm" onClick={press(skipToBest)} disabled={!hasBestAhead}>
            {t('Skip to best')}
          </button>
          <button className="btn sm" onClick={press(skipAll)}>
            {t('Skip')} ▸▸
          </button>
        </div>
      </div>
    )
  }

  const hero = heroes[idx]!
  const tint = TIER_TINT[tier]
  return (
    <div
      className={`sr ${reduced ? 'sr-calm' : ''} ${isFastBeat(star) ? 'sr-fast' : ''}`}
      role="dialog"
      aria-label={t('Mobius Summon')}
      style={vars({ '--tint': tint })}
      onClick={advance}
    >
      <div className={`sr-stage sr-t${tier}`}>
        <img className="px sr-circle" src={circleUrl(tint) || undefined} width={384} height={224} alt="" />
        {phase === 'beam' && (
          <>
            <div key={`beam${idx}`} className="sr-beam-wrap">
              <div key={`b${idx}-${step}`} className={`sr-beam ${step > 0 ? 'sr-surge' : ''}`} />
            </div>
            <img
              key={`crystal${idx}`}
              className="px sr-crystal"
              src={cachedDataUrl('summon-orb', () => scale(drawProp('summonCrystal', 0).bmp, 5)) || undefined}
              width={160}
              height={220}
              alt=""
            />
            <Motes key={`m${idx}-${tier}`} tier={tier} reduced={reduced} />
          </>
        )}
        {phase === 'card' && (
          <>
            <div key={`flash${idx}`} className="sr-flash" />
            <div key={`ring${idx}`} className="sr-ring" />
            <Motes key={`burst${idx}`} tier={tierOf(star)} reduced={reduced} burst />
            <div className="sr-reveal" key={`rv${idx}`}>
              <StepOut hero={hero} />
              <RevealCard hero={hero} star={star as Star} rareAt={rareAt} stamped={stamped} floorHit={lifted[idx] ?? false} items={items} reduced={reduced} />
            </div>
          </>
        )}
      </div>

      {heroes.length > 1 && (
        <div className="sr-orbs strip" aria-hidden>
          {stars.map((s, i) => (
            <span
              key={i}
              className={`sr-orb ${i === idx ? 'now' : ''} ${i < idx || (i === idx && phase === 'card') ? 'out' : ''}`}
              style={vars({ '--tint': TIER_TINT[orbTier(s, i < idx || (i === idx && phase === 'card'), reduced, rareAt)] })}
            />
          ))}
        </div>
      )}
      <div className="sr-count">
        {idx + 1} / {heroes.length}
      </div>
      {meter}
      <div className="sr-hint">{phase === 'card' ? t('Click or press Space to continue') : t('Click to reveal')}</div>
      <div className="sr-controls">
        {heroes.length > 1 && (
          <button className="btn sm" onClick={press(skipToBest)} disabled={!hasBestAhead && phase === 'card' && idx + 1 >= heroes.length}>
            {t('Skip to best')}
          </button>
        )}
        <button className="btn sm" onClick={press(skipAll)}>
          {t('Skip')} ▸▸
        </button>
      </div>
    </div>
  )
}

/** The Rising Quality Floor's count, in the corner. */
function PityMeter({ pool, gacha }: { pool: 'normal' | 'advanced'; gacha: Gacha }) {
  const G = TUNING.gacha
  const rows =
    pool === 'normal'
      ? [{ label: '★★★', now: gacha.pity, at: G.normalPityFloor3At }]
      : [
          { label: '★★★★', now: gacha.advPity4, at: G.advanced.pityFloor4At },
          { label: '★★★★★', now: gacha.advPity5, at: G.advanced.pityFloor5At },
        ]
  return (
    <div className="sr-pity" title={t('Quality floor: a dry streak this long guarantees the star shown.')}>
      <div className="sr-pity-title">{t('Quality floor')}</div>
      {rows.map((r) => (
        <div key={r.label} className="sr-pity-row">
          <span className="sr-pity-star">{r.label}</span>
          <span className="sr-pity-bar">
            <span style={{ width: `${Math.min(100, Math.round((r.now / r.at) * 100))}%` }} />
          </span>
          <span className="sr-pity-n">
            {r.now}/{r.at}
          </span>
        </div>
      ))}
    </div>
  )
}

function Motes({ tier, reduced, burst = false }: { tier: Tier; reduced: boolean; burst?: boolean }) {
  const n = moteCount(tier, reduced)
  return (
    <div className={`sr-motes ${burst ? 'sr-burst' : ''}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const p = motePlacement(i)
        const color = tier === 5 ? ['#f2c75c', '#fff6e0', '#ffd98a'][i % 3]! : TIER_TINT[tier]
        return (
          <span
            key={i}
            className="sr-mote"
            style={vars({
              left: `${p.left}%`,
              animationDelay: `${burst ? p.delay / 4 : p.delay}s`,
              background: color,
              color,
              '--drift': `${burst ? p.drift * 6 : p.drift}px`,
            })}
          />
        )
      })}
    </div>
  )
}

/** The hero steps out of the light: their full-body walk sprite, striding toward the Master. */
function StepOut({ hero }: { hero: OwnedHero }) {
  const a = heroFrameUrl(hero, 'down', 0)
  const b = heroFrameUrl(hero, 'down', 1)
  if (!a) return null
  return (
    <div className="sr-body" aria-hidden>
      <img className="px sr-body-a" src={a} alt="" />
      {b && <img className="px sr-body-b" src={b} alt="" />}
      <span className="sr-body-shadow" />
    </div>
  )
}

function StampView({ stamp, hero, items, best }: { stamp: Stamp; hero: OwnedHero; items?: readonly EquipmentItem[]; best: ReturnType<typeof bestGrade> }) {
  switch (stamp.kind) {
    case 'engraving': {
      const e = hero.engraving!
      const def = ENGRAVINGS[e.id]
      return (
        <span className={`sr-stamp st-seal grade-${e.grade}`} title={def ? t(def.blurb) : undefined}>
          <b className="st-seal-grade">{e.grade}</b> ❖ {def ? t(def.name) : e.id}
        </span>
      )
    }
    case 'weapon': {
      const item = items?.find((i) => i.id === hero.equipment.weapon)
      return (
        <span className="sr-stamp st-weapon" title={t('An Oath-weapon: bound to this hero alone.')}>
          ⚔ {item ? `${itemLabel(item.name)} · ${item.grade}` : t('Oath-weapon')}
        </span>
      )
    }
    case 'skill': {
      const def = SKILLS[stamp.id]
      if (!def) return null
      return (
        <span className={`sr-stamp st-skill grade-${def.grade}`}>
          <b>{def.grade}</b> {t(def.name)}
        </span>
      )
    }
    case 'trait':
      return <TraitChip def={traitOf(hero)} className="sr-stamp st-trait" />
    case 'grade':
      return gradeShout(best) ? (
        <span className={`sr-stamp st-grade g-${best.letter}`}>{t('{letter}-grade {attr}!', { letter: best.letter, attr: t(best.attr) })}</span>
      ) : (
        <span className="sr-stamp st-grade quiet">{t('Best grade: {letter} {attr}', { letter: best.letter, attr: t(best.attr) })}</span>
      )
    case 'floor':
      return <span className="sr-stamp st-floor">{t('Quality floor reached!')}</span>
  }
}

function RevealCard({
  hero,
  star,
  rareAt,
  stamped,
  floorHit,
  items,
  reduced,
}: {
  hero: OwnedHero
  star: Star
  rareAt: number
  stamped: boolean
  floorHit: boolean
  items?: readonly EquipmentItem[]
  reduced: boolean
}) {
  const bust = heroBustUrl(hero)
  const key = rarityWordKey(star, rareAt)
  const cameo = hero.origin === 'cameo'
  const word = cameo ? t('A face from the stories!') : key ? t(key) : null
  const el = ELEMENT_VIS[hero.element].color
  const p = personalityOf(hero)
  const best = bestGrade(hero.growthGrades)
  const stamps = cardStamps(hero, floorHit)
  const stagger = stampStagger(reduced)
  return (
    <div className={`sr-card sr-c${tierOf(star)} ${cameo ? 'sr-cameo' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="sr-card-face" style={vars({ '--rar': STAR_COLOR[star] })}>
        {word && <div className="sr-word">{word}</div>}
        <div className="sr-portrait" style={{ background: `linear-gradient(180deg, ${el}66 0%, #120e2c 90%)` }}>
          {bust && <img className="px" src={bust} alt={hero.name} />}
        </div>
        <div className="sr-name">{hero.name}</div>
        <div className="sr-stars">
          <Stars star={star} />
        </div>
        <div className="hmeta sr-meta">
          <ClassBadge heroClass={hero.heroClass} />
          <ElementBadge element={hero.element} />
        </div>
        {/* Who they were: the trade they left behind, a taste, the way they talk. */}
        <div className="sr-past">
          {t('Before the summon: {trade}', { trade: bornTrade(hero) })} · {t('Loves {food}', { food: t(p.food) })} · {t('Voice: {v}', { v: t(p.voice) })}
        </div>
        <div className="sr-greet">“{greeting(hero)}”</div>
        <div className={`sr-stamps ${stamped ? 'on' : ''}`} aria-live="polite">
          {stamped &&
            stamps.map((s, i) => (
              <span key={`${s.kind}${i}`} className="sr-stamp-wrap" style={{ animationDelay: `${(i * stagger) / 1000}s` }}>
                <StampView stamp={s} hero={hero} items={items} best={best} />
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}

function MiniCard({ h, s, isBest, k }: { h: OwnedHero; s: Star; isBest: boolean; k: number }) {
  const bust = heroBustUrl(h)
  const best = bestGrade(h.growthGrades)
  return (
    <div
      className={`sr-mini sr-c${tierOf(s)} ${isBest ? 'best' : ''} ${h.origin === 'cameo' ? 'sr-cameo' : ''}`}
      style={vars({ '--rar': STAR_COLOR[s], animationDelay: `${k * 0.06}s` })}
    >
      {isBest && <span className="sr-best-tag">{t('Best pull')}</span>}
      <div className="sr-mini-portrait" style={{ background: `linear-gradient(180deg, ${ELEMENT_VIS[h.element].color}55 0%, #120e2c 90%)` }}>
        {bust && <img className="px" src={bust} width={96} height={96} alt="" />}
      </div>
      <div className="sr-mini-name">{h.name}</div>
      <Stars star={s} />
      <div className="muted sr-mini-meta">
        <ClassIcon heroClass={h.heroClass} label /> <ElementIcon element={h.element} label />
      </div>
      <TraitChip def={traitOf(h)} compact />
      {gradeShout(best) && <div className={`sr-mini-grade g-${best.letter}`}>{t('{letter}-grade {attr}!', { letter: best.letter, attr: t(best.attr) })}</div>}
    </div>
  )
}

function Lineup({
  heroes,
  stars,
  rareAt,
  bondGroups,
  onClose,
  onNavigate,
  again,
  press,
}: {
  heroes: OwnedHero[]
  stars: number[]
  rareAt: number
  bondGroups?: Record<string, BondGroup>
  onClose: () => void
  onNavigate?: (view: 'party' | 'roster') => void
  again?: RevealAgain
  press: (fn: () => void) => (e: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  const best = lineupOrder(stars)[0]!
  const groups = lineupGroups(heroes, stars)
  let k = 0
  return (
    <div className="sr-lineup">
      <h3>{heroes.length === 1 ? t('A new hero answers the call') : t('{n} new heroes answer the call', { n: heroes.length })}</h3>
      {groups.map((g) => {
        const bond = g.group ? bondGroups?.[g.group] : undefined
        return (
          <div key={g.group ?? 'rest'} className={`sr-group ${g.group ? 'bonded' : ''}`}>
            {g.group && (
              <div className="sr-group-head">
                ⛓ {bond ? bondLabel(bond) : t('A bond group')}
                <span className="muted"> · {t('summoned together — they fight better side by side')}</span>
              </div>
            )}
            <div className={`sr-grid ${heroes.length === 1 ? 'one' : ''}`}>
              {g.order.map((i) => {
                const s = stars[i]! as Star
                const isBest = i === best && (heroes.length > 1 || s >= rareAt)
                return <MiniCard key={heroes[i]!.id} h={heroes[i]!} s={s} isBest={isBest} k={k++} />
              })}
            </div>
          </div>
        )
      })}
      <div className="sr-actions">
        {onNavigate && (
          <button className="btn primary" onClick={press(() => onNavigate('party'))}>
            {t('Party Board')}
          </button>
        )}
        {onNavigate && (
          <button className="btn" onClick={press(() => onNavigate('roster'))}>
            {t('Hero Registry')}
          </button>
        )}
        {again && (
          <button className="btn gold" onClick={press(again.onClick)} disabled={again.disabled}>
            {again.label}
          </button>
        )}
        <button className="btn ghost" onClick={press(onClose)}>
          {t('Done')}
        </button>
      </div>
    </div>
  )
}
