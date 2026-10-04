/**
 * The war room's words, pure: the forecast's band, the mission in plain language, each
 * hero's risk chip, the odds-changers and the Enter sheet's lines. Every string goes
 * through t(); the components only lay them out.
 */
import type { BattleOrder, GameState, HeroId, Objective } from '../../engine/types'
import type { EnterConcern, Forecast, ForecastAlternative, ForecastHero } from '../../engine/scout/forecast'
import type { Threat } from '../../engine/scout/scout'
import { TUNING } from '../../engine/tuning'
import { HIDDEN_OBJECTIVES } from '../../engine/content'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { deployReasonFix, deployReasonText } from '../deployReason'
import { pickerName } from '../hero/heroLabel'

export const THREAT_LABEL: Record<Threat, string> = {
  safe: 'Safe',
  fair: 'Fair fight',
  risky: 'Risky',
  deadly: 'Deadly',
}
export const THREAT_COLOR: Record<Threat, string> = {
  safe: 'var(--good)',
  fair: 'var(--gold)',
  risky: 'var(--warn)',
  deadly: 'var(--bad)',
}

export function threatLabel(th: Threat): string {
  return t(THREAT_LABEL[th])
}

/** A hero's name as the war room shows it (disambiguated; a fallen or unknown id reads as is). */
export function heroName(state: GameState, id: HeroId | null | undefined): string {
  if (!id) return t('an empty slot')
  return state.heroes[id] ? pickerName(state, state.heroes[id]!) : String(id)
}

/** "≈1.4 heroes fall an attempt" — the expected deaths in words. */
export function deathsLine(f: Pick<Forecast, 'expectedDeaths' | 'fielded'>): string {
  if (f.fielded === 0) return t('No one would fight.')
  if (f.expectedDeaths === 0) return t('In every run, everyone came home.')
  if (f.expectedDeaths >= f.fielded) return t('In every run, the whole party fell.')
  return t('About {n} heroes fall an attempt.', { n: f.expectedDeaths.toFixed(1) })
}

/** One objective in plain words. `names` maps a target tag to a unit's display name. */
export function objectiveText(o: Objective, waves: number, names: Record<string, string>): string {
  const who = (tag: string) => names[tag] ?? tag
  switch (o.kind) {
    case 'annihilate':
      return waves > 1 ? t('Defeat every enemy, through all {n} waves.', { n: waves }) : t('Defeat every enemy.')
    case 'survive':
      return t('Hold out for {n} ticks.', { n: o.ticks })
    case 'defend':
      return t('Hold the line through {n} waves.', { n: o.waves })
    case 'defeat':
      return t('Defeat {name}.', { name: who(o.targetTag) })
    case 'protect':
      return t('Keep {name} alive — if they fall, the mission fails.', { name: who(o.targetTag) })
    case 'reach':
      return t('Fight your way out: {n} steps (each hero’s turn is a step).', { n: o.distance })
    case 'acquire':
      return t('Take what {name} carries.', { name: who(o.targetTag) })
  }
}

/** The mission's win condition, line by line (plus the timer when it is not a survival). */
export function missionLines(f: Pick<Forecast, 'mission' | 'waves'>, names: Record<string, string>): string[] {
  const out = f.mission.objectives.map((o) => objectiveText(o, f.waves, names))
  const survives = f.mission.objectives.some((o) => o.kind === 'survive')
  if (f.mission.timer !== null && !survives) out.push(t('All within {n} ticks.', { n: f.mission.timer }))
  return out
}

export type ChipTone = 'good' | 'warn' | 'bad' | 'muted'

export interface RiskChip {
  heroId: HeroId
  name: string
  text: string
  tone: ChipTone
  /** What would help (for a tooltip). */
  hint?: string
}

/** One hero's risk, as a chip: refuses / may panic / falls in N% / comes home. */
export function heroRiskChip(state: GameState, h: ForecastHero): RiskChip {
  const name = heroName(state, h.heroId)
  if (!h.fights) {
    const reason = h.reason ?? 'dead'
    return { heroId: h.heroId, name, text: t('{name} stays home: {why}', { name, why: deployReasonText(reason) }), tone: 'bad', hint: deployReasonFix(reason) }
  }
  const parts: string[] = []
  let tone: ChipTone = 'good'
  if (h.deathPct > 0) {
    parts.push(t('falls in {p}%', { p: h.deathPct }))
    tone = h.deathPct >= 50 ? 'bad' : 'warn'
  }
  if (h.panicPct > 0) {
    parts.push(t('may panic: Sanity {s}', { s: Math.round(h.sanity) }))
    if (tone === 'good') tone = 'warn'
  }
  if (parts.length === 0) return { heroId: h.heroId, name, text: t('{name} comes home', { name }), tone: 'good' }
  return {
    heroId: h.heroId,
    name,
    text: `${name} · ${parts.join(' · ')}`,
    tone,
    ...(h.panicPct > 0 ? { hint: t('Panics in about {p}% of their turns. Rest or a banquet steadies them.', { p: h.panicPct }) } : {}),
  }
}

/** "62% → 88%" with the deaths change, for an odds-changer. */
export function altDelta(base: Forecast, alt: Forecast): string {
  // Nobody could fight before: the plan's own odds, not a comparison with nothing.
  if (base.fielded === 0) return `${t('{p}% to clear', { p: alt.winPct })} · ${deathsLine(alt)}`
  const d = Math.round((base.expectedDeaths - alt.expectedDeaths) * 10) / 10
  const win = t('{a}% → {b}%', { a: base.winPct, b: alt.winPct })
  if (d > 0) return `${win} · ${d === 1 ? t('1 fewer death') : t('{n} fewer deaths', { n: d })}`
  if (d < 0) return `${win} · ${-d === 1 ? t('1 more death') : t('{n} more deaths', { n: -d })}`
  return win
}

/** What an odds-changer does, in a line. */
export function altTitle(state: GameState, a: ForecastAlternative): string {
  switch (a.kind) {
    case 'suggested':
      return t('The suggested party')
    case 'swap': {
      const parts = a.swaps.map((s) =>
        s.out === null ? t('{in} fills a slot', { in: heroName(state, s.in) }) : t('{in} for {out}', { in: heroName(state, s.in), out: heroName(state, s.out) }),
      )
      return t('Bench the unfit: {swaps}', { swaps: parts.join(', ') })
    }
    case 'focus':
      return t('Open with Focus on {name}', { name: t(a.focus?.name ?? '') })
    case 'mark':
      return t('Mark {name} before the fight', { name: t(a.focus?.name ?? '') })
    case 'guard':
      return t('Brace for its big moves')
  }
}

/** The extra detail under an odds-changer (who comes in for whom, for the suggested party). */
export function altDetail(state: GameState, a: ForecastAlternative): string | null {
  if (a.kind === 'suggested') {
    const ins = a.swaps.filter((s) => s.in).map((s) => heroName(state, s.in))
    const outs = a.swaps.filter((s) => s.out).map((s) => heroName(state, s.out))
    if (ins.length === 0 && outs.length === 0) return t('The same heroes, in better lines.')
    return [ins.length > 0 ? t('in: {names}', { names: ins.join(', ') }) : '', outs.length > 0 ? t('out: {names}', { names: outs.join(', ') }) : ''].filter(Boolean).join(' · ')
  }
  if (a.kind === 'focus') return t('Your first order: every hero strikes it while it lives (one of this battle’s orders).')
  if (a.kind === 'mark') return t('Free: every hero strikes it from the first blow, and sweeps hit it harder.')
  if (a.kind === 'guard') return t('A standing order: the party braces the moment a foe winds up (one of this battle’s orders).')
  return null
}

/** An opening order, in words (the plan's line). */
export function openingText(o: BattleOrder, names: Record<string, string>): string {
  if (o.kind === 'focus') return t('Opening order: Focus {name}', { name: names[o.enemyId] ?? o.enemyId })
  if (o.kind === 'protect') return t('Opening order: Protect {name}', { name: names[o.allyId] ?? o.allyId })
  if (o.kind === 'guard') return o.onTelegraph ? t('Standing order: brace when a foe winds up') : t('Opening order: Guard')
  if (o.kind === 'hold') return t('Opening order: Hold SP for the big one')
  if (o.kind === 'unleash') return t('Opening order: Unleash {name}', { name: names[o.allyId] ?? o.allyId })
  if (o.kind === 'swap') return t('Opening order: swap {a} and {b}', { a: names[o.a] ?? o.a, b: names[o.b] ?? o.b })
  return t('Opening order: Retreat')
}

/** The Enter sheet's lines: each hero named with why, then the odds. */
export function concernLines(state: GameState, f: Forecast, c: EnterConcern): { text: string; fix?: string; tone: ChipTone }[] {
  const size = TUNING.account.partySize
  const out: { text: string; fix?: string; tone: ChipTone }[] = []
  if (c.short) {
    out.push({
      text: f.fielded === 0 ? t('No one in this party can fight.') : t('Only {n} of {m} will fight.', { n: f.fielded, m: size }),
      ...(f.emptySlots > 0 ? { fix: tn(f.emptySlots, '1 slot is empty.', '{n} slots are empty.') } : {}),
      tone: 'warn',
    })
  }
  for (const r of c.refusing) {
    const name = heroName(state, r.heroId)
    out.push({ text: `${name} ${deployReasonText(r.reason)}`, fix: deployReasonFix(r.reason), tone: 'bad' })
  }
  for (const s of c.shaky) {
    const name = heroName(state, s.heroId)
    out.push({
      text: t('{name} is at Sanity {s} and may panic ({p}% of their turns).', { name, s: Math.round(s.sanity), p: s.panicPct }),
      fix: t('Let them rest, or hold a banquet.'),
      tone: 'warn',
    })
  }
  if (c.grim) {
    out.push({
      text: t('The crystal gives this party {p}% — {band}.', { p: f.winPct, band: threatLabel(f.threat) }) + ' ' + deathsLine(f),
      tone: 'bad',
    })
  }
  return out
}

/** The truths and the ninetieth floor (B20): the rule, and where the Master stands. */
export interface TruthStanding {
  found: number
  /** Truths on floors already behind the Master that were not found (they cannot be any more). */
  missed: number
  /** Truths on floors still ahead. */
  ahead: number
  total: number
  need: number
  /** The rule can still be met. */
  reachable: boolean
  /** The Master may subvert F90 now. */
  qualified: boolean
}

export function truthStanding(state: GameState): TruthStanding {
  const found = new Set(state.tower.hiddenFound)
  let missed = 0
  let ahead = 0
  for (const h of HIDDEN_OBJECTIVES) {
    if (found.has(h.id)) continue
    if (h.floor <= state.tower.highestCleared) missed++
    else ahead++
  }
  // Truths beyond the ninetieth floor do not count towards refusing it.
  const usefulAhead = HIDDEN_OBJECTIVES.filter((h) => !found.has(h.id) && h.floor > state.tower.highestCleared && h.floor <= TUNING.tower.worldEndFloor).length
  const need = TUNING.lifecycle.subvertTruths
  // Lane O: a truth missed below the ninetieth floor can be found again by reliving its floor
  // (Memories of the Tower), until the fate is sealed.
  const sealed = state.tower.worldEnded || state.tower.worldSaved
  const recoverable = sealed ? 0 : HIDDEN_OBJECTIVES.filter((h) => !found.has(h.id) && h.floor <= state.tower.highestCleared && h.floor < TUNING.tower.worldEndFloor).length
  return {
    found: found.size,
    missed,
    ahead,
    total: HIDDEN_OBJECTIVES.length,
    need,
    reachable: found.size + usefulAhead + recoverable >= need || found.size >= need,
    qualified: found.size >= need,
  }
}
