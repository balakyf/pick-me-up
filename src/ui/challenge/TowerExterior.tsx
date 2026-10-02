import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { cachedDataUrl } from '../pixel/render'
import { crackStage, drawTowerStatic, floorRow, markerAt, towerDamage, TOWER_H, TOWER_W } from '../pixel/towerMap'
import { t } from '../i18n/i18n'
import './challenge.css'

const MAX_FLOOR = TUNING.tower.sliceTopFloor

/**
 * The tower from outside: where the party stands on the spire of 100 floors. After a
 * clear, the marker climbs to the new floor (held while a battle or its results are still
 * on screen); the stone cracks as the Wall nears; a dead world greys the floors past F90.
 *
 * B26: the stone is two cached images per crack stage (dark, and fully lit — the lit one is
 * clipped at the highest floor cleared), and the marker is a CSS overlay that glides on
 * its own — nothing animated ever reaches the never-evicting sprite cache. The art scales
 * with `--ts` (the war room raises it on wide screens).
 */
export function TowerExterior({ state, hold = false }: { state: GameState; hold?: boolean }) {
  const tw = state.tower
  const target = Math.min(tw.currentFloor, 100)
  const [marker, setMarker] = useState(target)
  const [arrived, setArrived] = useState(false)
  // A fall back down (the F40 loop) jumps; only a climb glides.
  const [falling, setFalling] = useState(false)
  const shown = useRef(target)

  useEffect(() => {
    if (hold) return
    const from = shown.current
    if (from === target) return
    shown.current = target
    setMarker(target)
    setFalling(target < from)
    // The CSS transition carries the climb; a fall back down (the F40 loop) is instant.
    if (target > from) {
      const id = setTimeout(() => setArrived(true), 1100)
      return () => clearTimeout(id)
    }
  }, [target, hold])

  useEffect(() => {
    if (!arrived) return
    const id = setTimeout(() => setArrived(false), 900)
    return () => clearTimeout(id)
  }, [arrived])

  const stage = crackStage(tw.highestCleared)
  const base = `tower3|${stage}|${tw.worldEnded}|${tw.worldSaved}`
  const dark = cachedDataUrl(`${base}|dark`, () => drawTowerStatic({ crackHighest: stage, worldEnded: tw.worldEnded, worldSaved: tw.worldSaved, lit: false }))
  const lit = cachedDataUrl(`${base}|lit`, () => drawTowerStatic({ crackHighest: stage, worldEnded: tw.worldEnded, worldSaved: tw.worldSaved, lit: true }))
  // Floors 1..highest are the rows from the highest floor's row to the ground.
  const litFrom = tw.highestCleared >= 1 ? floorRow(Math.min(100, tw.highestCleared)) : TOWER_H
  const m = hold ? shown.current : marker
  const at = markerAt(Math.max(1, Math.min(100, m)))
  const dmg = towerDamage(tw.highestCleared)
  return (
    <div
      className={`tower-exterior ${arrived ? 'arrived' : ''}`}
      title={t('Floor {n} of {max}', { n: Math.min(tw.currentFloor, MAX_FLOOR), max: MAX_FLOOR })}
      style={{ ['--tw' as string]: TOWER_W, ['--th' as string]: TOWER_H } as CSSProperties}
    >
      <div className="tower-art">
        {dark && <img className="px tower-layer" src={dark} alt={t('The Tower from outside')} />}
        {lit && (
          <img
            className="px tower-layer tower-lit"
            src={lit}
            alt=""
            aria-hidden="true"
            style={{ clipPath: `inset(calc(var(--ts) * ${litFrom}px) 0 0 0)` }}
          />
        )}
        {m >= 1 && m <= 100 && (
          <span
            className="tower-marker"
            aria-hidden="true"
            style={{ ['--mx' as string]: at.x, ['--my' as string]: at.y, ...(falling ? { transition: 'none' } : {}) } as CSSProperties}
          />
        )}
      </div>
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
