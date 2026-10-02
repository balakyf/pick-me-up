import { t } from '../i18n/i18n'

/** Pixel rows of the marks ('#' = ink): a crown for a unit that must fall, a shield for one to keep alive. */
const CROWN = ['#.#.#.#', '#######', '#.###.#', '#######']
const SHIELD = ['#######', '###.###', '##...##', '.##.##.', '..###..', '...#...']

/**
 * The mark an objective unit wears (on the stage, in the foe window and the objective HUD):
 * a gold crown for the target the mission names, a blue shield for the escort.
 */
export function ObjectiveMark({ kind, className = '' }: { kind: 'target' | 'escort'; className?: string }) {
  const rows = kind === 'target' ? CROWN : SHIELD
  const w = rows[0]!.length
  const h = rows.length
  return (
    <svg
      className={`obj-mark ${kind} ${className}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      shapeRendering="crispEdges"
      role="img"
      aria-label={kind === 'target' ? t('Objective target') : t('Escort')}
    >
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (c === '#' ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} /> : null)),
      )}
    </svg>
  )
}
