import type { GameState, SkillProgress } from '../../engine/types'
import { SKILLS } from '../../engine/content'
import { t } from '../i18n/i18n'

/** One line of skill news for the results screen (and the Daily Dungeon's report). */
export function skillProgressLine(p: SkillProgress, state: GameState): string {
  const who = state.heroes[p.heroId]?.name.split(/\s+/)[0] ?? t('A hero')
  const name = (id: string) => t(SKILLS[id]?.name ?? id)
  switch (p.kind) {
    case 'level-up':
      return t("▲ {who}'s {skill} reached Lv {n}", { who, skill: name(p.skillId), n: p.level })
    case 'merge':
      return t('✦ {who} fused {a} + {b} into {skill}!', { who, a: name(p.from[0]), b: name(p.from[1]), skill: name(p.skillId) })
    case 'unlock':
      return t('✧ {who} awakened a new skill: {skill}', { who, skill: name(p.skillId) })
    case 'achievement':
      return t('🏆 {who} earned {skill}!', { who, skill: name(p.skillId) })
  }
}
