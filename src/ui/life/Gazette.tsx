/**
 * The Camp Gazette (lane L): the waiting room's newspaper. Isel's letter is her voice and
 * the heroes' diaries; the Gazette is the record — the front page, the fallen, grief and
 * how it is easing, camp incidents (and the ones still waiting on you), friendships and
 * feuds, the work done, and how the camp's spirits stand.
 */
import type { ChronicleEntry, GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { gazette, type GazetteSection, type MoraleBand } from '../../engine/life'
import { PixelWindow } from '../kit'
import { t } from '../i18n/i18n'
import { accountDay, chronicleLine, shortName } from './speech'
import { dayOfSlot, slotOf } from '../../engine/life'
import { bandColor, bandName } from './moraleText'
import { IncidentCards } from './Incidents'
import './morale.css'

const SECTION_TITLE: Record<GazetteSection, string> = {
  fallen: 'In memoriam',
  grief: 'Grief and comfort',
  incidents: 'Around the camp',
  hearts: 'Hearts and bonds',
  feuds: 'Feuds',
  work: 'Work and craft',
}

const BANDS: MoraleBand[] = ['inspired', 'high', 'steady', 'low', 'shaken', 'broken']

/** Section lines, with repeats folded into one counted line. */
export function sectionLines(state: GameState, entries: readonly ChronicleEntry[]): string[] {
  const order: string[] = []
  const count = new Map<string, number>()
  for (const e of entries) {
    const line = chronicleLine(state, e)
    if (!count.has(line)) order.push(line)
    count.set(line, (count.get(line) ?? 0) + 1)
  }
  return order.map((l) => (count.get(l)! > 1 ? t('{line} (×{n})', { line: l, n: count.get(l)! }) : l))
}

export function GazetteWindow({
  state,
  store,
  onClose,
  onProfile,
  onFind,
  since,
}: {
  state: GameState
  store: Store
  /** Where the Gazette starts (default: the last letter, or a few days back). */
  since?: number
  onClose: () => void
  onProfile?: (id: string) => void
  onFind?: (id: string) => void
}) {
  const g = gazette(state, since)
  const today = accountDay(state, dayOfSlot(slotOf(g.until)))
  return (
    <PixelWindow title={t('The Camp Gazette')} icon="📰" onClose={onClose} wide>
      <div className="gz">
        <div className="gz-mast">
          <h3>{t('The Camp Gazette')}</h3>
          <div className="muted">
            {t('Day {n}', { n: today })} · {g.days === 1 ? t('the last day') : t('the last {n} days', { n: g.days })} · {t('{n} items', { n: g.total })}
          </div>
        </div>

        {g.headline ? <div className="gz-headline">{chronicleLine(state, g.headline)}</div> : <div className="gz-empty">{t('A quiet few days in the camp. Nothing made the front page.')}</div>}

        <div className="gz-outlook" aria-label={t('Morale outlook')}>
          <b>{t('Spirits')}:</b>
          {BANDS.filter((b) => g.outlook.counts[b] > 0).map((b) => (
            <span key={b} className="chip">
              <span className="gz-dot" style={{ background: bandColor(b) }} /> {bandName(b)} {g.outlook.counts[b]}
            </span>
          ))}
          {g.outlook.troubled.length > 0 && (
            <span className="small">
              {t('Need you')}:{' '}
              {g.outlook.troubled.slice(0, 6).map((id, i) => (
                <span key={id}>
                  {i > 0 && ', '}
                  <button className="linkish" onClick={() => onProfile?.(id)}>
                    {shortName(state, id)}
                  </button>
                </span>
              ))}
            </span>
          )}
        </div>

        {g.pending.length > 0 && (
          <div className="gz-sec">
            <h4>{t('Waiting on you')}</h4>
            <IncidentCards state={state} store={store} onFind={onFind} />
          </div>
        )}

        <div className="gz-cols">
          {g.sections.map((s) => (
            <div key={s.key} className={`gz-sec ${s.key}`}>
              <h4>{t(SECTION_TITLE[s.key])}</h4>
              <ul>
                {sectionLines(state, s.entries).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              {s.key === 'work' && g.masterXp > 0 && <div className="muted small">{t('The heroes’ mastery taught you {n} Master XP.', { n: g.masterXp })}</div>}
            </div>
          ))}
        </div>
        <button className="btn primary" onClick={onClose}>
          {t('Fold the Gazette')}
        </button>
      </div>
    </PixelWindow>
  )
}

/** How much news is waiting (the HUD badge): everything since the last letter. */
export function gazetteBadge(state: GameState): number {
  const since = state.life.letterReadAt
  let n = 0
  for (const e of state.life.chronicle) if (e.at > since) n++
  return n
}
