import { useState } from 'react'
import type { GameState, HeroId, OwnedHero, ReliveDifficulty } from '../../engine/types'
import type { Store } from '../../engine/store'
import { reliveWithResult } from '../../engine/store'
import { ENDGAME, RELIVE_DIFFICULTIES, fateOf, missedTruths, reliveAttemptsLeft, reliveRefusal, type ReliveOutcome } from '../../engine/endgame'
import { canEnterTrial } from '../../engine/challenge'
import { toWorldTime } from '../../engine/time'
import { PixelWindow } from '../kit'
import { BattleScene } from '../battle/BattleScene'
import { cpOf } from '../bits'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { HeroChip, lootLine } from '../challenge/common'
import { DIFFICULTY_LABEL, difficultyBlurb, memoryRows, truthsShort } from './endingText'
import './ending.css'

const R = ENDGAME.relive

/**
 * Memories of the Tower (lane O): relive a cleared anchor — or the floor that hid a truth —
 * as a memory, at a chosen difficulty, to find what was missed there. Named apart from the
 * weekly Echo Trial on purpose. Nobody dies in a memory (its replay is non-lethal), but it
 * costs Sanity; a few a world-week.
 */
export function Memories({ state, store, onClose }: { state: GameState; store: Store; onClose: () => void }) {
  const nowWorld = toWorldTime(Date.now())
  const rows = memoryRows(state)
  const eligible = (Object.values(state.heroes) as OwnedHero[]).filter((h) => canEnterTrial(h, state)).sort((a, b) => cpOf(b, state) - cpOf(a, state))
  const [floor, setFloor] = useState<number | null>(rows[0]?.floor ?? null)
  const [difficulty, setDifficulty] = useState<ReliveDifficulty>('true')
  const [team, setTeam] = useState<HeroId[]>(() => eligible.slice(0, 5).map((h) => h.id))
  const [err, setErr] = useState<string | null>(null)
  const [watch, setWatch] = useState<ReliveOutcome | null>(null)
  const [result, setResult] = useState<ReliveOutcome | null>(null)
  const left = reliveAttemptsLeft(state, nowWorld)
  const why = floor === null ? t('Clear an anchor first: only cleared floors can be relived.') : reliveRefusal(state, floor, difficulty, team, nowWorld)
  const short = truthsShort(state)
  const sealed = fateOf(state) !== null

  function toggle(id: HeroId) {
    setTeam((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 5 ? [...cur, id] : cur))
  }
  function enter() {
    if (floor === null) return
    setErr(null)
    try {
      const { outcome } = reliveWithResult(store.getState(), { floor, difficulty, heroIds: team }, Date.now())
      store.dispatch({ type: 'RELIVE_FLOOR', floor, difficulty, heroIds: team }, Date.now())
      setWatch(outcome)
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  if (watch) {
    return (
      <BattleScene
        log={watch.log}
        state={state}
        nonLethal
        onDone={() => {
          setResult(watch)
          setWatch(null)
        }}
      />
    )
  }

  return (
    <PixelWindow title={t('Memories of the Tower')} icon="✧" onClose={onClose} wide>
      {result ? (
        <div className="memory-result">
          <div className={`big-outcome ${result.won ? 'win' : ''}`}>{result.won ? t('The memory holds') : t('The memory slips away')}</div>
          {result.truths.length > 0 ? (
            <div className="room-loot">✦ {tn(result.truths.length, 'A truth recovered!', '{n} truths recovered!')}</div>
          ) : (
            result.won && <div className="muted small">{t('No truth was found in this memory.')}</div>
          )}
          {(result.gold > 0 || result.gems > 0 || Object.keys(result.materials).length > 0) && (
            <div className="room-loot">🎁 {lootLine({ gold: result.gold, gems: result.gems, materials: result.materials })}</div>
          )}
          <div className="muted small">{t('It was only a memory: nobody died. Reliving it cost each of them {n} Sanity.', { n: result.sanityCost })}</div>
          <div className="ending-actions">
            <button className="pbtn" onClick={() => setWatch(result)}>
              ▸ {t('Watch again')}
            </button>
            <button className="btn primary" onClick={() => setResult(null)}>
              {t('Back')}
            </button>
          </div>
        </div>
      ) : (
        <div className="memories">
          <div className="muted small">
            {t('Relive a floor you have cleared, as a memory. Nobody dies here, but remembering costs {n} Sanity each.', { n: R.sanityCost })}{' '}
            {!sealed && short > 0 && <b>{tn(short, 'One more truth would let you refuse the ninetieth floor.', '{n} more truths would let you refuse the ninetieth floor.')}</b>}
          </div>
          <div className="weekly-stats">
            <span>
              {t('Memories left this week')} <b>{left}</b>/{R.attemptsPerWeek}
            </span>
            <span>
              {t('Truths to recover')} <b>{missedTruths(state).length}</b>
            </span>
          </div>
          <div className="memories-list" role="listbox" aria-label={t('Floors to relive')}>
            {rows.length === 0 && <div className="muted">{t('Clear an anchor first: only cleared floors can be relived.')}</div>}
            {rows.map((r) => (
              <button key={r.floor} type="button" role="option" aria-selected={floor === r.floor} className={`memory-row ${floor === r.floor ? 'sel' : ''}`} onClick={() => setFloor(r.floor)}>
                <span className="mr-title">
                  F{r.floor} · {r.title}
                </span>
                {r.missed.map((h) => (
                  <span key={h.id} className="mr-truth">
                    ◇ {t('A truth was missed here:')} {t(h.hint)}
                  </span>
                ))}
                {r.found.map((h) => (
                  <span key={h.id} className="mr-truth found">
                    ✓ {t(h.name)}
                  </span>
                ))}
              </button>
            ))}
          </div>
          <h4 className="panel-sub">{t('How it comes back')}</h4>
          <div className="memory-diffs" role="radiogroup" aria-label={t('How it comes back')}>
            {RELIVE_DIFFICULTIES.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={difficulty === d} className={`pbtn sm memory-diff ${difficulty === d ? 'sel' : 'ghost'}`} onClick={() => setDifficulty(d)}>
                {t(DIFFICULTY_LABEL[d])}
              </button>
            ))}
          </div>
          <div className="muted small">{difficultyBlurb(difficulty)}</div>
          <h4 className="panel-sub">
            {t('Who remembers')} ({team.length}/5)
          </h4>
          <div className="raid-roster">
            {eligible.length === 0 && <div className="muted">{t('No one is at home to remember.')}</div>}
            {eligible.map((h) => (
              <HeroChip key={h.id} state={state} hero={h} selected={team.includes(h.id)} onClick={() => toggle(h.id)} />
            ))}
          </div>
          <div className="raid-actions">
            <button className="pbtn ghost" onClick={() => setTeam(eligible.slice(0, 5).map((h) => h.id))}>
              ✦ {t('Strongest team')}
            </button>
            <span className="spacer" />
            <button className="pbtn primary" disabled={why !== null} onClick={enter}>
              ✧ {t('Relive it')}
            </button>
          </div>
          {why && <div className="muted small" style={{ color: 'var(--warn)' }}>{t(why)}</div>}
          {err && <div className="muted small" style={{ color: 'var(--bad)' }}>{err}</div>}
        </div>
      )}
    </PixelWindow>
  )
}

/** The bar's launcher line: how many truths wait, and the week's memories. */
export function memoriesLabel(state: GameState, nowWorld: number): string {
  const missed = missedTruths(state).length
  const left = reliveAttemptsLeft(state, nowWorld)
  return `${missed > 0 ? `${tn(missed, '· 1 truth to recover', '· {n} truths to recover')} ` : ''}· ${tn(left, '1 left this week', '{n} left this week')}`
}
