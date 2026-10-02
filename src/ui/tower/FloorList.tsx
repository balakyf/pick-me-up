/**
 * The war room's floor list: the acts the Master has reached (the current one open), each
 * floor named — anchors by their mission, seeded floors by a generated name and a mission
 * icon — and the acts still ahead collapsed and unnamed (no spoilers of what waits).
 */
import type { ReactNode, Ref } from 'react'
import type { GameState } from '../../engine/types'
import { ACTS, ANCHORS } from '../../engine/content'
import { TUNING } from '../../engine/tuning'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { FloorModBadge } from './FloorMods'
import { actAhead, actNumeral, floorMission, floorName, missionIcon } from './floorNames'

const MAX_FLOOR = TUNING.tower.sliceTopFloor

export function FloorList({
  state,
  openActs,
  onToggle,
  currentRef,
  enemyCount,
  peek,
}: {
  state: GameState
  openActs: ReadonlySet<string>
  onToggle: (actId: string) => void
  currentRef?: Ref<HTMLDivElement>
  /** Enemies on the current floor (from the live preview). */
  enemyCount: number | null
  /** A Devoted hero's peek line for the current floor, if any. */
  peek?: ReactNode
}) {
  const current = state.tower.currentFloor
  return (
    <div className="tower floor-list">
      {ACTS.flatMap((act) => {
        const ahead = actAhead(act.from, current)
        const open = !ahead && openActs.has(act.id)
        const floors = open ? Array.from({ length: act.to - act.from + 1 }, (_, i) => act.from + i) : []
        return [...floors, `act:${act.id}`]
      }).map((f) => {
        if (typeof f === 'string') {
          const act = ACTS.find((a) => `act:${a.id}` === f)!
          if (actAhead(act.from, current)) {
            return (
              <div key={f} className="act-head sealed" title={t('Reach F{n} to learn what waits there.', { n: act.from })}>
                <span className="act-title">
                  🔒 {t('Act {n} — ???', { n: actNumeral(act.id) })}
                </span>
                <span className="muted">{t('F{a}–{b} · not yet reached', { a: act.from, b: Math.min(act.to, MAX_FLOOR) })}</span>
              </div>
            )
          }
          const cleared = Math.max(0, Math.min(act.to, state.tower.highestCleared) - act.from + 1)
          return (
            <button key={f} className={`act-head ${openActs.has(act.id) ? 'open' : ''}`} onClick={() => onToggle(act.id)} aria-expanded={openActs.has(act.id)}>
              <span className="act-title">
                {openActs.has(act.id) ? '▾' : '▸'} {t(act.title)}
              </span>
              <span className="muted">
                {t(act.subtitle)} · {cleared}/{act.to - act.from + 1}
              </span>
            </button>
          )
        }
        const cleared = f <= state.tower.highestCleared
        const isCurrent = f === current
        const locked = f > current
        const anchor = ANCHORS[f]
        const cls = ['floor', cleared ? 'cleared' : '', isCurrent ? 'current' : '', locked ? 'locked' : ''].filter(Boolean).join(' ')
        const mission = floorMission(state, f)
        const name = anchor ? t('Floor {n}', { n: f }) : (floorName(state.seed, f) ?? t('Floor {n}', { n: f }))
        return (
          <div key={f} className={cls} ref={isCurrent ? currentRef : undefined} aria-current={isCurrent ? 'step' : undefined}>
            <div className="fnum">{cleared ? '✓' : `F${f}`}</div>
            <div className="fdesc">
              <div className="ft">
                {name} {anchor && <span className="anchor-badge">{t('ANCHOR')}</span>}
                {f === TUNING.tower.worldEndFloor && <span className="anchor-badge danger">{t("WORLD'S END")}</span>}
                <FloorModBadge state={state} floor={f} />
              </div>
              <div className="fs">
                <span className="mission-icon" aria-hidden="true">
                  {missionIcon(mission)}
                </span>{' '}
                {t(mission)}
                {cleared && !anchor && <span className="muted"> · F{f}</span>}
                {isCurrent && enemyCount !== null && ` · ${tn(enemyCount, '1 enemy', '{n} enemies')}`}
                {isCurrent && state.tower.attemptIndex > 0 && ` · ${t('attempt {n}', { n: state.tower.attemptIndex + 1 })}`}
                {anchor?.minigame === 'ballista' && ` · 🎯 ${t('ballista')}`}
              </div>
              {isCurrent && peek}
            </div>
            {isCurrent && <span className="floor-here">{t('◂ you are here')}</span>}
          </div>
        )
      })}
    </div>
  )
}
