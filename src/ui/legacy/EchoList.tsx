import type { OwnedHero } from '../../engine/types'
import { echoesOf, fragmentTakes } from '../../engine/legacy'
import { t } from '../i18n/i18n'
import { firstName, skillName, statGift } from './legacyText'
import './legacy.css'

/**
 * The Echoes a hero carries, as permanent badges: "✦ Echo of Mira · +10% P.ATK". Meant
 * for the hero profile (and used by the Memorial). Renders nothing for a hero who
 * carries none.
 */
export function EchoList({ hero }: { hero: OwnedHero }) {
  const echoes = echoesOf(hero)
  if (echoes.length === 0) return null
  return (
    <div className="echo-list">
      {echoes.map((e, i) => (
        <span key={`${e.fromHeroId}-${i}`} className="echo-badge" title={t('Passed on by {name}, who fell in the tower.', { name: e.fromName })}>
          ✦ {t('Echo of {name}', { name: firstName(e.fromName) })} · {statGift(e.stat, e.pct)}
          {e.skillId && fragmentTakes(hero, e.skillId) && ` · ${t('{skill} +1', { skill: skillName(e.skillId) })}`}
        </span>
      ))}
    </div>
  )
}
