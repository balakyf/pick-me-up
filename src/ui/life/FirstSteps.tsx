/**
 * Onboarding (Living Lobby spec §7): Isel's "first steps" for a new Master. Each step is
 * read from the state (the engine records only what it cannot see, like a first talk),
 * so the checklist can never drift from what actually happened.
 *
 * Since the fun-and-return pass (spec 2026-10-12 S4) the checklist lives inside the goal
 * tracker: while onboarding is incomplete its next step is the tracker's "short" goal,
 * and each step knows where to send the Master.
 */
import type { GameState, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import type { GoalTarget } from '../shell/goals'
import { isPlaceOpen } from '../../engine/unlocks'
import { t } from '../i18n/i18n'

export interface GuideStep {
  id: string
  label: string
  hint: string
  done: (s: GameState) => boolean
  /** Where a click on this step takes the Master (null: nowhere useful). */
  target: (s: GameState) => GoalTarget | null
}

const BUILDINGS = ['tavern', 'garden', 'forge', 'infirmary', 'library', 'watchtower', 'market'] as const

const living = (s: GameState): OwnedHero[] => (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive)

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'pull',
    label: 'Take your first summon',
    hint: 'The Mobius crystal in the Great Hall owes you ten heroes, free.',
    done: (s) => s.life.guide.tutorialPull || living(s).length >= 6,
    target: () => ({ kind: 'place', place: 'summon' }),
  },
  {
    id: 'party',
    label: 'Set a party of five',
    hint: 'The party board hangs in the Tactical Center (north road).',
    done: (s) => {
      const n = living(s).length
      return s.party.slots.filter(Boolean).length >= Math.min(5, n) && n > 1
    },
    target: () => ({ kind: 'place', place: 'party' }),
  },
  {
    id: 'floor',
    label: 'Clear Floor 1',
    hint: 'The Tower Gate is in the north wall. Read the scouting report first.',
    done: (s) => s.tower.highestCleared >= 1,
    target: () => ({ kind: 'place', place: 'tower' }),
  },
  {
    id: 'talk',
    label: 'Talk to one of your heroes',
    hint: 'Walk up to anyone and press E. They are people, not tools.',
    done: (s) => s.life.guide.done.includes('talk'),
    target: (s) => {
      const h = living(s)[0]
      return h ? { kind: 'hero', heroId: h.id, action: 'talk' } : null
    },
  },
  {
    id: 'job',
    label: 'Give a hero a job',
    hint: 'A cook in the Kitchen feeds everyone better. Open a hero’s Profile to assign one.',
    done: (s) => living(s).some((h) => h.life?.job),
    target: (s) => {
      const h = living(s).find((x) => !x.life?.job)
      return h ? { kind: 'hero', heroId: h.id, action: 'profile' } : null
    },
  },
  {
    id: 'build',
    label: 'Build something new',
    hint: 'A Tavern or a Garden: step into the dark, unbuilt place and build it.',
    done: (s) => BUILDINGS.some((b) => s.facilities[b].level > 0 || s.facilities[b].build !== null),
    // The first unbuilt building the campus has opened (the Tavern, which opens next,
    // before any has): never a preview when a real build is on offer.
    target: (s) => {
      const open = BUILDINGS.find((b) => s.facilities[b].level === 0 && isPlaceOpen(s, b === 'forge' ? 'armory' : b))
      return { kind: 'place', place: open === undefined ? 'tavern' : open === 'forge' ? 'armory' : open }
    },
  },
]

export function guideComplete(s: GameState): boolean {
  return s.life.guide.done.includes('dismissed') || GUIDE_STEPS.every((g) => g.done(s))
}

/** The onboarding checklist, as the goal tracker shows it when expanded. */
export function FirstStepsList({
  state,
  store,
  onGo,
}: {
  state: GameState
  store: Store
  onGo: (target: GoalTarget) => void
}) {
  const next = GUIDE_STEPS.find((g) => !g.done(state))
  return (
    <div className="guide-steps">
      <ul className="guide-list">
        {GUIDE_STEPS.map((g) => {
          const done = g.done(state)
          const target = done ? null : g.target(state)
          const mark = done ? '✓' : g === next ? '▶' : '·'
          return (
            <li key={g.id} className={done ? 'done' : g === next ? 'next' : ''}>
              {target ? (
                <button className="linkish guide-go" onClick={() => onGo(target)}>
                  {mark} {t(g.label)}
                </button>
              ) : (
                <>
                  {mark} {t(g.label)}
                </>
              )}
            </li>
          )
        })}
      </ul>
      {next && <div className="guide-hint">{t(next.hint)}</div>}
      <button className="pbtn sm ghost" onClick={() => store.dispatch({ type: 'GUIDE_STEP', step: 'dismissed' })}>
        {t('I know my way')}
      </button>
    </div>
  )
}
