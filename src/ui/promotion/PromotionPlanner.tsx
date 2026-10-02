/**
 * The Promotion Chamber's planner (lane J): before a single stone is paid, the chamber shows
 * what the promotion will do (the star and cap, every growth grade after, the engraving, the
 * trait that may awaken) and lays out the Master's choices — the calling a classless hero
 * takes up at 3★ (one of two) and the skill they learn (one of three). The choices ride on
 * the PROMOTE_HERO command; the chamber picks when the Master does not.
 */
import { useMemo, useState } from 'react'
import type { GameState, HeroClass, OwnedHero } from '../../engine/types'
import { promotionPreview, type PromotionChoice } from '../../engine/promotion'
import { CLASS_SKILL, ENGRAVINGS, SKILLS, TRAITS } from '../../engine/content'
import { classLabel, ClassIcon } from '../bits'
import { roleLabel, skillBlurb, skillRole } from '../skillText'
import { t } from '../i18n/i18n'
import { TraitChip } from '../people/TraitBadge'
import { gradeRows } from './ceremonyPlan'
import './promotion.css'

export function PromotionPlanner({
  state,
  hero,
  affordable,
  onPromote,
}: {
  state: GameState
  hero: OwnedHero
  affordable: boolean
  onPromote: (choice: PromotionChoice) => void
}) {
  const floor = state.tower.highestCleared
  const plain = useMemo(() => promotionPreview(hero, state.seed, {}, floor), [hero, state.seed, floor])
  const [cls, setCls] = useState<HeroClass | undefined>(plain.classOffers.length > 1 ? plain.heroClass ?? undefined : undefined)
  const pv = useMemo(() => promotionPreview(hero, state.seed, cls ? { heroClass: cls } : {}, floor), [hero, state.seed, cls, floor])
  const [skill, setSkill] = useState<string | undefined>(undefined)
  const chosenSkill = skill !== undefined && pv.skillOffers.includes(skill) ? skill : (pv.defaultSkill ?? undefined)
  const rows = gradeRows(pv.grades.before, pv.grades.after)

  function begin() {
    // Only what overrules the chamber rides on the command (its own pick needs no saying).
    const choice: PromotionChoice = {}
    if (pv.classOffers.length > 1 && cls && cls !== plain.heroClass) choice.heroClass = cls
    if (pv.skillOffers.length > 1 && chosenSkill && chosenSkill !== pv.defaultSkill) choice.skillId = chosenSkill
    onPromote(choice)
  }

  return (
    <div className="promo-plan" onClick={(e) => e.stopPropagation()}>
      <div className="promo-plan-top">
        <span>
          <b>
            {pv.fromStar}★ → {pv.toStar}★
          </b>
        </span>
        <span className="muted">{t('Level cap {from} → {to}', { from: pv.levelCap.from, to: pv.levelCap.to })}</span>
        <span className="muted">
          {pv.engraving.kind === 'evolve'
            ? t('Engraving: {name} {from} → {to}', {
                name: t(ENGRAVINGS[pv.engraving.from.id]?.name ?? pv.engraving.from.id),
                from: pv.engraving.from.grade,
                to: pv.engraving.to.grade,
              })
            : pv.engraving.kind === 'awaken'
              ? t('Engraving: {n}% chance one awakens', { n: pv.engraving.chancePct })
              : t('Engraving: none yet (4★ and up)')}
        </span>
      </div>

      <div>
        <h5>{t('Growth grades after')}</h5>
        <div className="promo-grades">
          {rows.map((r) => (
            <div
              key={r.key}
              className={`promo-grade ${pv.grades.bonusAttr === r.key ? 'bonus' : ''}`}
              title={pv.grades.bonusAttr === r.key ? t('Its potential: this grade rises one more.') : undefined}
            >
              {t(r.label)}
              <b>
                {r.fromLetter}→{r.toLetter}
              </b>
              {r.delta > 0 ? `+${r.delta}` : '·'}
            </div>
          ))}
        </div>
      </div>

      <div className="promo-plan-top">
        <span>{t('Trait')}</span>
        {pv.trait.from === pv.trait.to ? (
          <TraitChip def={TRAITS[pv.trait.to]} compact />
        ) : (
          <>
            <TraitChip def={TRAITS[pv.trait.from]} compact /> → <TraitChip def={TRAITS[pv.trait.to]} compact />
            <span className="muted">{t('(it awakens!)')}</span>
          </>
        )}
      </div>

      {pv.classOffers.length > 1 && (
        <div>
          <h5>{t('Choose a calling')}</h5>
          <div className="promo-choices" role="radiogroup" aria-label={t('Choose a calling')}>
            {pv.classOffers.map((c) => {
              const sig = SKILLS[CLASS_SKILL[c]]
              return (
                <button key={c} role="radio" aria-checked={cls === c} className={`promo-choice ${cls === c ? 'sel' : ''}`} onClick={() => setCls(c)}>
                  <span className="pc-name">
                    <ClassIcon heroClass={c} /> {classLabel(c)}
                  </span>
                  {sig && <span className="pc-note">{t('Learns {skill}', { skill: t(sig.name) })}</span>}
                  {c === plain.heroClass && <span className="pc-tag">{t("the chamber's pick")}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {pv.skillOffers.length > 1 ? (
        <div>
          <h5>{t('Choose a skill to learn')}</h5>
          <div className="promo-choices" role="radiogroup" aria-label={t('Choose a skill to learn')}>
            {pv.skillOffers.map((id) => {
              const def = SKILLS[id]
              if (!def) return null
              return (
                <button key={id} role="radio" aria-checked={chosenSkill === id} className={`promo-choice ${chosenSkill === id ? 'sel' : ''}`} onClick={() => setSkill(id)}>
                  <span className="pc-name">
                    {def.grade} · {t(def.name)}
                  </span>
                  <span className="pc-note">
                    {roleLabel(skillRole(def))} · {skillBlurb(def, 1)}
                  </span>
                  {id === pv.defaultSkill && <span className="pc-tag">{t("the chamber's pick")}</span>}
                </button>
              )
            })}
          </div>
        </div>
      ) : pv.skillOffers.length === 1 ? (
        <div className="muted">{t('Learns {skill}', { skill: t(SKILLS[pv.skillOffers[0]!]?.name ?? pv.skillOffers[0]!) })}</div>
      ) : (
        <div className="muted">{t('Knows every skill the chamber could teach.')}</div>
      )}

      {pv.unlocks.length > 0 && (
        <div className="muted">{t('The new levels also unlock: {list}', { list: pv.unlocks.map((id) => t(SKILLS[id]?.name ?? id)).join(', ') })}</div>
      )}

      <div className="promo-plan-foot">
        <span className="muted">{t('What the chamber shows is what happens.')}</span>
        <button className="btn sm primary" onClick={begin} disabled={!affordable} title={affordable ? t('Begin promotion') : t('Not enough materials')}>
          {t('⬆ Begin the promotion')}
        </button>
      </div>
    </div>
  )
}
