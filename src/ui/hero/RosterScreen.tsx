import { useState } from 'react'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { HeroCard } from '../HeroCard'
import { HeroBond } from '../metaPanels'
import { cpOf } from '../bits'
import { t } from '../i18n/i18n'

function roster(state: GameState): OwnedHero[] {
  return Object.values(state.heroes) as OwnedHero[]
}

// ── Roster ───────────────────────────────────────────────────────────────────
export function RosterScreen({ state, store }: { state: GameState; store?: Store }) {
  const [sel, setSel] = useState<HeroId | null>(null)
  const heroes = roster(state).sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1
    return cpOf(b) - cpOf(a)
  })
  const living = heroes.filter((h) => h.alive).length

  return (
    <div className="screen">
      <h2>{t('Roster')}</h2>
      <p className="sub">
        {heroes.length === 1 ? t('1 hero') : t('{n} heroes', { n: heroes.length })} · {t('{n} living · click a card for full stats.', { n: living })}
      </p>
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
