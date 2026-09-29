/**
 * Onboarding (Living Lobby spec §7): Isel's "first steps" for a new Master. Each step is
 * read from the state (the engine records only what it cannot see, like a first talk),
 * so the checklist can never drift from what actually happened.
 */
import { useState } from 'react'
import type { GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import { t } from '../i18n/i18n'

export interface GuideStep {
  id: string
  label: string
  hint: string
  done: (s: GameState) => boolean
}

const BUILDINGS = ['tavern', 'garden', 'forge', 'infirmary', 'library', 'watchtower', 'market'] as const

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
    hint: 'A Tavern or a Garden: step into the dark, unbuilt place and build it.',
    done: (s) => BUILDINGS.some((b) => s.facilities[b].level > 0 || s.facilities[b].build !== null),
  },
]

export function guideComplete(s: GameState): boolean {
  return s.life.guide.done.includes('dismissed') || GUIDE_STEPS.every((g) => g.done(s))
}

export function FirstSteps({ state, store }: { state: GameState; store: Store }) {
  const [open, setOpen] = useState(true)
  if (guideComplete(state)) return null
  const done = GUIDE_STEPS.filter((g) => g.done(state)).length
  const next = GUIDE_STEPS.find((g) => !g.done(state))
  return (
    <div className="hud hud-guide">
      <button className="guide-head" onClick={() => setOpen(!open)}>
        ✧ {t('First steps')} · {done}/{GUIDE_STEPS.length} {open ? '▾' : '▸'}
      </button>
      {open && (
        <>
          <ul className="guide-list">
            {GUIDE_STEPS.map((g) => (
              <li key={g.id} className={g.done(state) ? 'done' : g === next ? 'next' : ''}>
                {g.done(state) ? '✓' : g === next ? '▶' : '·'} {t(g.label)}
              </li>
            ))}
          </ul>
          {next && <div className="guide-hint">{t(next.hint)}</div>}
          <button className="pbtn sm ghost" onClick={() => store.dispatch({ type: 'GUIDE_STEP', step: 'dismissed' })}>
            {t('I know my way')}
          </button>
        </>
      )}
    </div>
  )
}
