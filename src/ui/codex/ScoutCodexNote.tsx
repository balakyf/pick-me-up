/** The scouting report's Codex hint: an enemy already studied, and what beats it. */
import type { ScoutedEnemy } from '../../engine/scout'
import { ENEMY_TEMPLATES } from '../../engine/content'
import { intelOf } from '../../engine/codex'
import { ELEMENT_VIS, ElementIcon } from '../bits'
import { t } from '../i18n/i18n'

export function ScoutCodexNote({ enemy, floorStudied }: { enemy: ScoutedEnemy; floorStudied: boolean }) {
  const tpl = enemy.templateId ? ENEMY_TEMPLATES[enemy.templateId] : undefined
  if (!tpl || (!enemy.studied && !floorStudied)) return null
  const weak = intelOf(tpl).weakTo
  return (
    <span className="scout-codex" title={enemy.studied ? t('In the Enemy Codex') : undefined}>
      {enemy.studied ? '📖 ' : ''}
      {weak.map((el) => (
        <ElementIcon key={el} element={el} />
      ))}
      {weak.length > 0 ? ' ' : ''}
      {weak.length > 0
        ? t('beaten by {what}', { what: weak.map((el) => t(ELEMENT_VIS[el].label)).join(' / ') })
        : t('no elemental weakness')}
    </span>
  )
}
