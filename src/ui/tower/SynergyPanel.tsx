/**
 * Party bonds & formation, shown before a floor: which pairs in the party are friends or
 * rivals and what that does in battle, and what each hero's line does for them.
 */
import type { BondKind, CombatBond, GameState, HeroId, Line, OwnedHero } from '../../engine/types'
import { DEPTH, adjacentLines, bestLine, coverChance, formationNotes, partyBonds } from '../../engine/depth'
import { t } from '../i18n/i18n'
import { classGlyph } from '../bits'
import '../codex/combatDepth.css'

const BOND_LABEL: Record<BondKind, string> = {
  closeFriend: 'Close friend',
  friend: 'Friend',
  rival: 'Rival',
  grudge: 'Grudge',
}
const BOND_ICON: Record<BondKind, string> = { closeFriend: '♥', friend: '♡', rival: '⚔', grudge: '☠' }
const LINE_LABEL: Record<Line, string> = { front: 'front', mid: 'mid', back: 'back' }

const pct = (x: number) => Math.round(x * 100)
/** Bond rows shown before "+N more". */
const MAX_BONDS = 5
const first = (n: string) => n.split(/\s+/)[0] ?? n

function bondEffect(kind: BondKind, affinity: number, canCover: boolean): string {
  const B = DEPTH.bonds
  switch (kind) {
    case 'closeFriend':
      return [
        canCover ? t('may take a killing blow for the other ({n}%)', { n: pct(coverChance(affinity)) }) : t('too far apart to cover each other'),
        t('follow-ups {n}%', { n: pct(B.followUpCloseFriend) }),
      ].join(' · ')
    case 'friend':
      return t('follow-ups {n}%', { n: pct(B.followUpFriend) })
    case 'rival':
      return t('+{n}% damage, competing for kills · may ignore a focus order', { n: pct(B.rivalDamage) })
    case 'grudge':
      return [
        t('+{n}% damage, competing for kills · may ignore a focus order', { n: pct(B.rivalDamage) }),
        t('−{n}% accuracy beside them', { n: pct(B.grudgeMiss) }),
      ].join(' · ')
  }
}

/** The party as it stands: deployable heroes with the line each slot fights on. */
function lineup(state: GameState): { hero: OwnedHero; line: Line }[] {
  const out: { hero: OwnedHero; line: Line }[] = []
  state.party.slots.forEach((id, i) => {
    const hero = id ? state.heroes[id] : undefined
    if (hero?.alive) out.push({ hero, line: state.party.lines[i] ?? 'front' })
  })
  return out
}

export function SynergyPanel({ state }: { state: GameState }) {
  const members = lineup(state)
  if (members.length === 0) return null
  const lineOf = new Map<string, Line>(members.map((m) => [m.hero.id, m.line]))
  // Rivalries first (they cost you), then the strongest friendships; a crowded party shows its top few.
  const weight = (b: CombatBond) => (b.kind === 'rival' || b.kind === 'grudge' ? 1000 : 0) + Math.abs(b.affinity)
  const allBonds = partyBonds(state, members.map((m) => m.hero.id as HeroId)).sort((x, y) => weight(y) - weight(x))
  const bonds = allBonds.slice(0, MAX_BONDS)
  const notes = formationNotes(members.map((m) => ({ heroClass: m.hero.heroClass, line: m.line })))
  const F = DEPTH.formation
  const name = (id: string) => first(state.heroes[id as HeroId]?.name ?? id)

  return (
    <div className="pframe synergy">
      <div className="event-head">
        <span className="event-kind">{t('Bonds & formation')}</span>
        <span className="muted">{t('how this party fights together')}</span>
      </div>
      <div className="synergy-list">
        {bonds.length === 0 && <div className="muted small">{t('No bonds in this party yet — heroes who live and fight together grow close.')}</div>}
        {bonds.map((b) => {
          const canCover = adjacentLines(lineOf.get(b.a) ?? 'front', lineOf.get(b.b) ?? 'front')
          const bad = b.kind === 'rival' || b.kind === 'grudge'
          return (
            <div key={`${b.a}|${b.b}`} className="synergy-row">
              <span className={`chip bond-${b.kind}`}>
                {BOND_ICON[b.kind]} {t(BOND_LABEL[b.kind])}
              </span>
              <b className="synergy-pair">
                {name(b.a)} &amp; {name(b.b)}
              </b>
              <span className={`synergy-effect ${bad ? 'bad' : ''}`}>{bondEffect(b.kind, b.affinity, canCover)}</span>
            </div>
          )
        })}
        {allBonds.length > bonds.length && <div className="muted small">{t('+{n} more', { n: allBonds.length - bonds.length })}</div>}
      </div>
      <div className="synergy-list">
        {members.map((m, i) => {
          const n = notes[i]!
          const best = bestLine(m.hero.heroClass)
          const parts: { text: string; good: boolean }[] = []
          if (n.dealtPct > 0) parts.push({ text: t('+{n}% damage from here', { n: n.dealtPct }), good: true })
          if (n.dealtPct < 0)
            parts.push({ text: t('−{n}% damage here — fights best at the {line}', { n: -n.dealtPct, line: t(LINE_LABEL[best ?? 'front']) }), good: false })
          if (n.shelter === 'backCover') parts.push({ text: t('sheltered by the front line: −{n}% damage taken', { n: pct(1 - F.backCover) }), good: true })
          if (n.shelter === 'midSupport') parts.push({ text: t('backed by the mid line: −{n}% damage taken', { n: pct(1 - F.midSupportTaken) }), good: true })
          if (n.supportHeal) parts.push({ text: t('support: +{n}% healing', { n: pct(F.midSupportHeal - 1) }), good: true })
          return (
            <div key={m.hero.id} className="formation-row">
              <span className="formation-line">{t(LINE_LABEL[m.line])}</span>
              <span className="formation-name">
                {classGlyph(m.hero.heroClass)} {first(m.hero.name)}
              </span>
              <span className="formation-effects">
                {parts.length === 0 && <span className="muted small">{t('no formation effect')}</span>}
                {parts.map((p, k) => (
                  <span key={p.text} className={p.good ? 'formation-good' : 'formation-bad'}>
                    {k > 0 && <span className="muted"> · </span>}
                    {p.text}
                  </span>
                ))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
