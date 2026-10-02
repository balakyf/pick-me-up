import { useState } from 'react'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { traitOf } from '../../engine/content/traits'
import { HeroCard } from '../HeroCard'
import { HeroBond } from '../metaPanels'
import { cpOf } from '../bits'
import { t } from '../i18n/i18n'
import { traitFilterOptions } from '../people/traitText'
import '../people/people.css'

function roster(state: GameState): OwnedHero[] {
  return Object.values(state.heroes) as OwnedHero[]
}

/** The Registry's trait filter: every trait, any rare one, or a single trait by id. */
export type TraitFilter = 'all' | 'rare' | string

/** Does a hero pass the trait filter? (Pure; the Registry's filter bar reads it.) */
export function matchesTraitFilter(hero: OwnedHero, filter: TraitFilter): boolean {
  if (filter === 'all') return true
  const def = traitOf(hero)
  return filter === 'rare' ? def.rarity === 'rare' : def.id === filter
}

// ── Roster ───────────────────────────────────────────────────────────────────
export function RosterScreen({ state, store }: { state: GameState; store?: Store }) {
  const [sel, setSel] = useState<HeroId | null>(null)
  const [trait, setTrait] = useState<TraitFilter>('all')
  const everyone = roster(state).sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1
    return cpOf(b) - cpOf(a)
  })
  const heroes = everyone.filter((h) => matchesTraitFilter(h, trait))
  const living = everyone.filter((h) => h.alive).length

  return (
    <div className="screen">
      <h2>{t('Roster')}</h2>
      <p className="sub">
        {everyone.length === 1 ? t('1 hero') : t('{n} heroes', { n: everyone.length })} · {t('{n} living · click a card for full stats.', { n: living })}
      </p>
      <div className="roster-filters">
        <label>
          {t('Trait')}
          <select value={trait} onChange={(e) => setTrait(e.target.value)} aria-label={t('Filter by trait')}>
            <option value="all">{t('Every trait')}</option>
            <option value="rare">{t('Rare traits only')}</option>
            {traitFilterOptions().map((o) => (
              <option key={o.id} value={o.id}>
                {o.rare ? `✦ ${o.label}` : `✧ ${o.label}`}
              </option>
            ))}
          </select>
        </label>
        {trait !== 'all' && (
          <span className="muted">
            {t('{shown} of {n} shown', { shown: heroes.length, n: everyone.length })}{' '}
            <button className="linkish" onClick={() => setTrait('all')}>
              {t('Reset filters')}
            </button>
          </span>
        )}
      </div>
      {heroes.length === 0 && <div className="empty muted">{t('No hero has this trait yet.')}</div>}
      <div className="grid cards">
        {heroes.map((h) => (
          <HeroCard
            key={h.id}
            hero={h}
            selected={sel === h.id}
            showStats={sel === h.id}
            masterLevel={state.meta.masterLevel}
            onClick={() => setSel(sel === h.id ? null : h.id)}
          />
        ))}
      </div>
      {sel && store && state.heroes[sel] && (
        <div className="roster-bond">
          <HeroBond hero={state.heroes[sel]!} state={state} store={store} />
        </div>
      )}
    </div>
  )
}
