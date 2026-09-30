import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { cachedDataUrl } from '../pixel/render'
import { scale } from '../pixel/bitmap'
import { drawTowerExterior, towerDamage, TOWER_H, TOWER_W } from '../pixel/towerMap'
import { t } from '../i18n/i18n'
import './challenge.css'

const MAX_FLOOR = TUNING.tower.sliceTopFloor
const CLIMB_MS = 1100

/**
 * The tower from outside: where the party stands on the spire of 100 floors. After a
 * clear, the marker climbs to the new floor (held while a battle or its results are still
 * on screen); the stone cracks as the Wall nears; a dead world greys the floors past F90.
 */
export function TowerExterior({ state, hold = false }: { state: GameState; hold?: boolean }) {
  const tw = state.tower
  const target = Math.min(tw.currentFloor, 100)
  const [marker, setMarker] = useState(target)
  const [arrived, setArrived] = useState(false)
  const shown = useRef(target)

  useEffect(() => {
    if (hold) return
    const from = shown.current
    if (from === target) return
    // Climb up (or, for the F40 loop's fall, drop straight back down).
    if (target < from) {
      shown.current = target
      setMarker(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / CLIMB_MS)
      const eased = 1 - (1 - k) * (1 - k)
      const m = Math.round((from + (target - from) * eased) * 2) / 2
      setMarker(m)
      if (k < 1) raf = requestAnimationFrame(step)
      else {
        shown.current = target
        setArrived(true)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, hold])

  useEffect(() => {
    if (!arrived) return
    const id = setTimeout(() => setArrived(false), 900)
    return () => clearTimeout(id)
  }, [arrived])

  const m = hold ? shown.current : marker
  const key = `tower2|${m}|${tw.currentFloor}|${tw.highestCleared}|${tw.worldEnded}|${tw.worldSaved}`
  const url = cachedDataUrl(key, () =>
    scale(
      drawTowerExterior({ current: tw.currentFloor, highest: tw.highestCleared, worldEnded: tw.worldEnded, worldSaved: tw.worldSaved, marker: m }),
      2,
    ),
  )
  const dmg = towerDamage(tw.highestCleared)
  return (
    <div className={`tower-exterior ${arrived ? 'arrived' : ''}`} title={t('Floor {n} of {max}', { n: Math.min(tw.currentFloor, MAX_FLOOR), max: MAX_FLOOR })}>
      {url && <img className="px" src={url} width={TOWER_W * 2} height={TOWER_H * 2} alt={t('The Tower from outside')} />}
      <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
        {t('{n}/{max} cleared', { n: tw.highestCleared, max: MAX_FLOOR })}
      </div>
      {tw.worldEnded ? (
        <div className="tower-omen dead">{t('Above the ninetieth floor, nothing lives.')}</div>
      ) : dmg >= 1 ? (
        <div className="tower-omen">{t('The Wailing Wall splits the stone.')}</div>
      ) : dmg > 0 ? (
        <div className="tower-omen">{t('Cracks spread as the Wall draws near.')}</div>
      ) : null}
    </div>
  )
}
