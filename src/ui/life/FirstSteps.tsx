/**
 * Onboarding (Living Lobby spec §7): Isel's "first steps" for a new Master. Each step is
 * read from the state (the engine records only what it cannot see, like a first talk),
 * so the checklist can never drift from what actually happened.
 */
import { useEffect, useState } from 'react'
import type { FacilityId, GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { t } from '../i18n/i18n'

export interface GuideStep {
  id: string
  label: string
  /** What to do next; may read the state (e.g. a step still gated by Master Level). */
  hint: string | ((s: GameState) => string)
  done: (s: GameState) => boolean
}

/** Anything raised past where the account started (or a site under way) counts as building. */
export function builtSomething(s: GameState): boolean {
  const start = TUNING.lobby.facilityStartLevels as Partial<Record<FacilityId, number>>
  return (Object.keys(s.facilities) as FacilityId[]).some((f) => {
    const fac = s.facilities[f]
    return fac.build !== null || fac.level > (start[f] ?? 0)
  })
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'pull',
    label: 'Take your first summon',
    hint: 'The Mobius crystal in the Great Hall owes you ten heroes, free.',
    done: (s) => s.life.guide.tutorialPull || Object.values(s.heroes).filter((h) => h.alive).length >= 6,
  },
  {
    id: 'party',
    label: 'Set a party of five',
    hint: 'The party board hangs in the Tactical Center (north road).',
    done: (s) => {
      const living = Object.values(s.heroes).filter((h) => h.alive).length
      return s.party.slots.filter(Boolean).length >= Math.min(5, living) && living > 1
    },
  },
  {
    id: 'floor',
    label: 'Clear Floor 1',
    hint: 'The Tower Gate is in the north wall. Read the scouting report first.',
    done: (s) => s.tower.highestCleared >= 1,
  },
  {
    id: 'talk',
    label: 'Talk to one of your heroes',
    hint: 'Walk up to anyone and press E. They are people, not tools.',
    done: (s) => s.life.guide.done.includes('talk'),
  },
  {
    id: 'job',
    label: 'Give a hero a job',
    hint: 'A cook in the Kitchen feeds everyone better. Open a hero’s Profile to assign one.',
    done: (s) => Object.values(s.heroes).some((h) => h.alive && h.life?.job),
  },
  {
    id: 'build',
    label: 'Build something new',
    hint: (s) =>
      s.meta.masterLevel < TUNING.lobby.facilities.unlockMasterLevel.tavern!
        ? 'The Tavern and the Garden open at Master Lv 2: clear a floor or two first. Then press 🔨 Build, top right.'
        : 'Press 🔨 Build (top right), or walk to a dirt lot marked with a hammer and use its signpost.',
    done: builtSomething,
  },
]

/** The guide.done key that latches a step once it has been seen done. */
export const latchKey = (id: string): string => `step:${id}`

/** A step stays done once done (a hero dying never un-ticks 'Set a party of five'). */
export function stepDone(s: GameState, g: GuideStep): boolean {
  return s.life.guide.done.includes(latchKey(g.id)) || g.done(s)
}

/** Steps done right now that are not latched yet (FirstSteps latches them). */
export function unlatchedSteps(s: GameState): GuideStep[] {
  return GUIDE_STEPS.filter((g) => !s.life.guide.done.includes(latchKey(g.id)) && g.done(s))
}

/** Past this floor the Master plainly knows the way: the panel retires on its own. */
export const GUIDE_RETIRES_AT_FLOOR = 15

export function guideComplete(s: GameState): boolean {
  return (
    s.life.guide.done.includes('dismissed') ||
    s.tower.highestCleared >= GUIDE_RETIRES_AT_FLOOR ||
    GUIDE_STEPS.every((g) => stepDone(s, g))
  )
}

export function FirstSteps({ state, store }: { state: GameState; store: Store }) {
  const [open, setOpen] = useState(true)
  // Latch what is done, so a step never goes back (the store records it like 'talk').
  // A retired guide latches nothing: no save writes for a panel nobody sees.
  const toLatch = guideComplete(state) ? '' : unlatchedSteps(state).map((g) => g.id).join(',')
  useEffect(() => {
    if (!toLatch) return
    for (const id of toLatch.split(',')) store.dispatch({ type: 'GUIDE_STEP', step: latchKey(id) })
  }, [toLatch, store])
  if (guideComplete(state)) return null
  const done = GUIDE_STEPS.filter((g) => stepDone(state, g)).length
  const next = GUIDE_STEPS.find((g) => !stepDone(state, g))
  return (
    <div className="hud hud-guide">
      <button className="guide-head" onClick={() => setOpen(!open)}>
        ✧ {t('First steps')} · {done}/{GUIDE_STEPS.length} {open ? '▾' : '▸'}
      </button>
      {open && (
        <>
          <ul className="guide-list">
            {GUIDE_STEPS.map((g) => (
              <li key={g.id} className={stepDone(state, g) ? 'done' : g === next ? 'next' : ''}>
                {stepDone(state, g) ? '✓' : g === next ? '▶' : '·'} {t(g.label)}
              </li>
            ))}
          </ul>
          {next && <div className="guide-hint">{t(typeof next.hint === 'string' ? next.hint : next.hint(state))}</div>}
          <button className="pbtn sm ghost" onClick={() => store.dispatch({ type: 'GUIDE_STEP', step: 'dismissed' })}>
            {t('I know my way')}
          </button>
        </>
      )}
    </div>
  )
}
