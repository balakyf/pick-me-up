import type { StatusKey } from '../../engine/types'
import { statusIsGood, statusName, type StatusMark, type UnitStatusView } from './statusCaptions'
import './statusIcons.css'

/**
 * Small pixel icons for the statuses a unit carries (lane F): over its head on the stage,
 * and beside its HP in the party rows. Each icon is a 5×5 pixel glyph drawn as SVG rects
 * (crisp at any zoom); the words a status throws as it takes hold pop above them.
 */

/** The 5×5 glyph of each status ('#' = ink) and its colour. */
const GLYPH: Record<StatusKey, { rows: readonly string[]; color: string }> = {
  taunt: { rows: ['..#..', '..#..', '..#..', '.....', '..#..'], color: '#ff8a3d' },
  shield: { rows: ['#####', '#####', '#####', '.###.', '..#..'], color: '#7fc8ff' },
  regen: { rows: ['..#..', '..#..', '#####', '..#..', '..#..'], color: '#6fe08a' },
  stun: { rows: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'], color: '#ffe066' },
  bleed: { rows: ['..#..', '.###.', '#####', '#####', '.###.'], color: '#e8404a' },
  poison: { rows: ['..#..', '.###.', '#####', '#####', '.###.'], color: '#9be04a' },
  burn: { rows: ['..#..', '.##..', '.###.', '#####', '.###.'], color: '#ff7a1a' },
  'atk-up': { rows: ['..#..', '.###.', '#####', '..#..', '..#..'], color: '#ff6a5a' },
  'atk-down': { rows: ['..#..', '..#..', '#####', '.###.', '..#..'], color: '#ff6a5a' },
  'def-up': { rows: ['..#..', '.###.', '#####', '..#..', '..#..'], color: '#9fb4ff' },
  'def-down': { rows: ['..#..', '..#..', '#####', '.###.', '..#..'], color: '#9fb4ff' },
  'spd-up': { rows: ['..#..', '.###.', '#####', '..#..', '..#..'], color: '#5fe6e6' },
  'spd-down': { rows: ['..#..', '..#..', '#####', '.###.', '..#..'], color: '#5fe6e6' },
  'crit-up': { rows: ['..#..', '.###.', '#####', '..#..', '..#..'], color: '#ffd23d' },
  'crit-down': { rows: ['..#..', '..#..', '#####', '.###.', '..#..'], color: '#ffd23d' },
  'guard-up': { rows: ['#...#', '#####', '#####', '.###.', '..#..'], color: '#b8d8ff' },
  'guard-down': { rows: ['..#..', '.#.#.', '##.##', '.#.#.', '..#..'], color: '#ff4fd8' },
}

/** One status glyph (exported for the dev gallery and tests). */
export function StatusGlyph({ status, px = 2 }: { status: StatusKey; px?: number }) {
  const g = GLYPH[status]
  const rects: JSX.Element[] = []
  g.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') rects.push(<rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} />)
  })
  return (
    <svg className="st-glyph" width={5 * px} height={5 * px} viewBox="0 0 5 5" shapeRendering="crispEdges" aria-hidden="true">
      <rect x={-0.5} y={-0.5} width={6} height={6} className="st-glyph-bg" />
      <g fill={g.color}>{rects}</g>
    </svg>
  )
}

/** The order icons appear in: dangers first (a stun, the DoTs, a Mark), then the boons. */
const ORDER: readonly StatusKey[] = [
  'stun',
  'burn',
  'poison',
  'bleed',
  'guard-down',
  'atk-down',
  'def-down',
  'spd-down',
  'crit-down',
  'taunt',
  'shield',
  'regen',
  'guard-up',
  'atk-up',
  'def-up',
  'spd-up',
  'crit-up',
]

/** A unit's marks in display order, at most `max` (the rest summarised as a count). */
export function orderedMarks(marks: readonly StatusMark[], max: number): { shown: StatusMark[]; more: number } {
  const sorted = [...marks].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
  return { shown: sorted.slice(0, max), more: Math.max(0, sorted.length - max) }
}

function title(m: StatusMark): string {
  const name = statusName(m.key)
  if (m.key === 'shield') return `${name} (${m.value})`
  if (m.key.startsWith('crit')) return `${name} ${m.key.endsWith('-up') ? '+' : '−'}${m.value}`
  if (m.key.endsWith('-up') || m.key.endsWith('-down')) return `${name} ${m.key.endsWith('-up') ? '+' : '−'}${m.value}%`
  return name
}

/**
 * The statuses on one unit. `compact` is the party-row form (a line of icons, no pops);
 * otherwise the stage form: icons over the head and the pops above them.
 */
export function StatusIcons({ view, compact = false, dead = false }: { view: UnitStatusView; compact?: boolean; dead?: boolean }) {
  if (dead || (view.marks.length === 0 && (compact || view.pops.length === 0))) return null
  const { shown, more } = orderedMarks(view.marks, compact ? 6 : 4)
  return (
    <div className={`st-icons ${compact ? 'st-inrow' : 'st-over'}`}>
      {shown.length > 0 && (
        <div className="st-row">
          {shown.map((m) => (
            <span key={m.key} className={`st-icon ${statusIsGood(m.key) ? 'good' : 'bad'}`} title={title(m)}>
              <StatusGlyph status={m.key} px={compact ? 2 : 1.6} />
            </span>
          ))}
          {more > 0 && <span className="st-more">+{more}</span>}
        </div>
      )}
      {!compact &&
        view.pops.map((p) => (
          <span key={p.seq} className={`st-pop ${p.cls}`}>
            {p.text}
          </span>
        ))}
    </div>
  )
}
