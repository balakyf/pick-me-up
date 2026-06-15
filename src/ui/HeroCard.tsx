import type { OwnedHero } from '../engine/types'
import { deriveStatsForHero, levelCapForStar } from '../engine/stats'
import { Stars, ElementBadge, ClassBadge, Portrait, STAR_COLOR, cpOf, gradeLetters } from './bits'

interface Props {
  hero: OwnedHero
  onClick?: () => void
  selected?: boolean
  showStats?: boolean
}

export function HeroCard({ hero, onClick, selected, showStats }: Props) {
  const cap = levelCapForStar(hero.star)
  const dead = !hero.alive
  const cls = ['card', onClick ? 'click' : '', selected ? 'sel' : '', dead ? 'dead' : ''].filter(Boolean).join(' ')
  const stats = showStats ? deriveStatsForHero(hero, hero.xp.level) : null
  const grades = gradeLetters(hero)

  return (
    <div className={cls} onClick={onClick}>
      <div className="rarity-strip" style={{ background: STAR_COLOR[hero.star] }} />
      <Portrait hero={hero} />
      <div className="row">
        <div className="hname">{hero.name}</div>
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        <Stars star={hero.star} />
        <span className="muted">
          Lv {hero.xp.level}
          <span style={{ opacity: 0.6 }}>/{cap}</span>
        </span>
      </div>
      <div className="hmeta">
        <ClassBadge heroClass={hero.heroClass} />
        <ElementBadge element={hero.element} />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="muted" title="Growth grades (STR/AGI/VIT/INT/WIL)">
          {grades.STR}/{grades.AGI}/{grades.VIT}/{grades.INT}/{grades.WIL}
        </span>
        <span className="cp">
          <span className="lab">CP </span>
          {cpOf(hero)}
        </span>
      </div>
      {dead && <div className="muted" style={{ color: 'var(--bad)', marginTop: 6, fontWeight: 700 }}>☠ Fallen</div>}
      {stats && (
        <div className="statgrid">
          <span className="k">HP</span><span className="v">{stats.maxHP}</span>
          <span className="k">P.ATK</span><span className="v">{stats.pAtk}</span>
          <span className="k">M.ATK</span><span className="v">{stats.mAtk}</span>
          <span className="k">P.DEF</span><span className="v">{stats.pDef}</span>
          <span className="k">M.DEF</span><span className="v">{stats.mDef}</span>
          <span className="k">SPD</span><span className="v">{stats.spd}</span>
          <span className="k">CRIT</span><span className="v">{stats.critPct}%</span>
        </div>
      )}
    </div>
  )
}
