import type { OwnedHero, Star } from '../engine/types'
import { baitRevealed, shownStar } from '../engine/shop'
import { favorTierName } from '../engine/favor'
import { levelCapForStar } from '../engine/stats'
import { Stars, ElementBadge, ClassBadge, Portrait, STAR_COLOR, cpOf, statsOf, gradeLetters, SkillList, EngravingBadge } from './bits'
import { t } from './i18n/i18n'
import { bornTrade } from './hero/heroLabel'
import { BondBadge } from './bond/BondBadge'

interface Props {
  hero: OwnedHero
  onClick?: () => void
  selected?: boolean
  showStats?: boolean
  /** For the whale-bait display star (the lie holds until Master Lv 25). */
  masterLevel?: number
}

export function HeroCard({ hero, onClick, selected, showStats, masterLevel = 1 }: Props) {
  const star = shownStar(hero, masterLevel) as Star
  const lied = hero.displayStar !== undefined && baitRevealed(hero, masterLevel)
  const cap = levelCapForStar(hero.star)
  const dead = !hero.alive
  const cls = ['card', onClick ? 'click' : '', selected ? 'sel' : '', dead ? 'dead' : ''].filter(Boolean).join(' ')
  const stats = showStats ? statsOf(hero) : null
  const grades = gradeLetters(hero)

  return (
    <div className={cls} onClick={onClick}>
      <div className="rarity-strip" style={{ background: STAR_COLOR[star] }} />
      <Portrait hero={hero} />
      <div className="row">
        <div className="hname">{hero.name}</div>
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        <Stars star={star} />
        <span className="muted">
          {t('Lv {level}', { level: hero.xp.level })}
          <span style={{ opacity: 0.6 }}>/{cap}</span>
        </span>
      </div>
      <div className="hmeta">
        <ClassBadge heroClass={hero.heroClass} trade={bornTrade(hero)} />
        <ElementBadge element={hero.element} />
        {hero.alive && <span className="favor-chip" title={t('Favorability {n}/100', { n: hero.favor })}>♥ {t(favorTierName(hero.favor))}</span>}
      </div>
      <BondBadge hero={hero} />
      {hero.captiveOf && <div className="goddess-lied">{t('⛓ held by {master} — ransom or rescue them', { master: hero.captiveOf.master })}</div>}
      {lied && <div className="goddess-lied">{t('the goddess lied — shown {displayStar}★, truly {star}★', { displayStar: hero.displayStar ?? hero.star, star: hero.star })}</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <span className="muted" title={t('Growth grades (STR/AGI/VIT/INT/WIL)')}>
          {grades.STR}/{grades.AGI}/{grades.VIT}/{grades.INT}/{grades.WIL}
        </span>
        <span className="cp">
          <span className="lab">{t('CP')} </span>
          {cpOf(hero)}
        </span>
      </div>
      <EngravingBadge hero={hero} />
      <SkillList hero={hero} max={showStats ? undefined : 3} />
      {dead && <div className="muted" style={{ color: 'var(--bad)', marginTop: 6, fontWeight: 700 }}>{t('☠ Fallen')}</div>}
      {stats && (
        <div className="statgrid">
          <span className="k">{t('HP')}</span><span className="v">{stats.maxHP}</span>
          <span className="k">{t('P.ATK')}</span><span className="v">{stats.pAtk}</span>
          <span className="k">{t('M.ATK')}</span><span className="v">{stats.mAtk}</span>
          <span className="k">{t('P.DEF')}</span><span className="v">{stats.pDef}</span>
          <span className="k">{t('M.DEF')}</span><span className="v">{stats.mDef}</span>
          <span className="k">{t('SPD')}</span><span className="v">{stats.spd}</span>
          <span className="k">{t('CRIT')}</span><span className="v">{stats.critPct}%</span>
        </div>
      )}
    </div>
  )
}
