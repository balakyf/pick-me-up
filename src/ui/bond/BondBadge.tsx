import type { BondGroup, GameState, HeroId, OwnedHero } from '../../engine/types'
import { challengeOf, CHALLENGE } from '../../engine/challenge'
import { getStore } from '../useGame'
import { getLocale, t } from '../i18n/i18n'
import { FR_BOND_WORDS } from '../i18n/frChallenge'

/**
 * Bonds (canon 인연): heroes summoned together. A small ⛓ badge with the group's name for
 * hero cards and profiles, and the list of a hero's bond siblings for the profile.
 */

/** One generated name part in the active locale. */
function word(w: string): string {
  return getLocale() === 'fr' ? (FR_BOND_WORDS[w] ?? w) : w
}

/** The group's display name ("the Gale Band" / « la Bande de la Rafale »). */
export function bondLabel(g: BondGroup): string {
  if (!g.adj || !g.noun) return g.name
  const suffix = g.name.match(/ (\d+)$/)?.[1]
  const base = g.adj === 'Twin' ? t('the Twin {noun}', { noun: word(g.noun) }) : t('the {adj} {noun}', { adj: word(g.adj), noun: word(g.noun) })
  return suffix ? `${base} ${suffix}` : base
}

/** The bond group of a hero (from `groups`, else the live game's). */
function groupFor(hero: OwnedHero, groups?: Record<string, BondGroup>): BondGroup | null {
  if (!hero.bondGroup) return null
  const all = groups ?? getStore().getState()?.challenge?.bondGroups
  return all?.[hero.bondGroup] ?? null
}

/** ⛓ + group name, or nothing for an unbound hero. */
export function BondBadge({ hero, groups }: { hero: OwnedHero; groups?: Record<string, BondGroup> }) {
  const g = groupFor(hero, groups)
  if (!g) return null
  const n = g.members.length
  const B = CHALLENGE.bonds
  const full = Math.round((B.perExtra * (n - 1) + B.fullSet) * 100)
  return (
    <span
      className="bond-badge"
      title={t('Summoned together ({n}). Fighting side by side: +{a}% per extra member, +{full}% as a full set.', {
        n,
        a: Math.round(B.perExtra * 100),
        full,
      })}
    >
      ⛓ {bondLabel(g)}
    </span>
  )
}

/** The profile's "Bond" section: the group and its members (the fallen greyed). */
export function BondList({ state, hero, onFind }: { state: GameState; hero: OwnedHero; onFind?: (id: string) => void }) {
  const g = hero.bondGroup ? challengeOf(state).bondGroups[hero.bondGroup] : undefined
  if (!g) return null
  const others = g.members.filter((id) => id !== hero.id)
  return (
    <div className="bond-list">
      <h4 className="panel-sub">
        ⛓ {t('Bond')} · {bondLabel(g)}
      </h4>
      <div className="muted small">{t('Summoned together. They fight better side by side — and grieve harder.')}</div>
      <div className="bond-members">
        {others.map((id: HeroId) => {
          const o = state.heroes[id]
          if (!o) return null
          return (
            <button key={id} className={`linkish bond-member ${o.alive ? '' : 'fallen'}`} onClick={() => onFind?.(id)} disabled={!o.alive}>
              {o.alive ? '' : '✝ '}
              {o.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
