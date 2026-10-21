/**
 * Onboarding (Living Lobby spec §7): Isel's "first steps" for a new Master. Each step is
 * read from the state (the engine records only what it cannot see, like a first talk),
 * so the checklist can never drift from what actually happened.
 *
 * Since the fun-and-return pass (spec 2026-10-12 S4) the checklist lives inside the goal
 * tracker: while onboarding is incomplete its next step is the tracker's "short" goal,
 * and each step knows where to send the Master.
 *
 * A step, once done, stays done (playtest 2026-10-13: "3/6 → 2/6" when the Master shrank
 * the party). The two steps whose condition can lapse — a party of five, a hero's job —
 * latch: the action that completes them records it in `life.guide.done` (`recordStep`;
 * no new save field), and saves from before that are read from what cannot be undone (a
 * floor fought, a job worked).
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
  /** Done, latched: true once the step has ever been completed. */
  done: (s: GameState) => boolean
  /** A latching step's own condition, right now (what `recordStep` records). */
  now?: (s: GameState) => boolean
  /** Where a click on this step takes the Master (null: nowhere useful). */
  target: (s: GameState) => GoalTarget | null
}

const BUILDINGS = ['tavern', 'garden', 'forge', 'infirmary', 'library', 'watchtower', 'market'] as const

const living = (s: GameState): OwnedHero[] => (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive)
const recorded = (s: GameState, id: string): boolean => s.life.guide.done.includes(id)

const partyOfFive = (s: GameState): boolean => {
  const n = living(s).length
  return s.party.slots.filter(Boolean).length >= Math.min(5, n) && n > 1
}
const holdsJob = (s: GameState): boolean => living(s).some((h) => h.life?.job)

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
    now: partyOfFive,
    // Latched; or a party has climbed (a floor cleared, Floor 1 fought).
    done: (s) => recorded(s, 'party') || partyOfFive(s) || s.tower.highestCleared >= 1 || s.tower.attemptIndex > 0,
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
    now: holdsJob,
    // Latched; or someone (a fallen hero too) has worked a job.
    done: (s) =>
      recorded(s, 'job') ||
      holdsJob(s) ||
      (Object.values(s.heroes) as OwnedHero[]).some((h) => Object.values(h.life?.jobXp ?? {}).some((x) => (x ?? 0) > 0)),
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

/**
 * Latch a step the Master just completed: call right after the action that completes it
 * (setting the party, assigning a job). Records it in `life.guide.done`, so it stays done
 * when the party later shrinks or the job ends. A no-op when the step is not done right
 * now or is already recorded; never throws.
 */
export function recordStep(store: Store, id: 'party' | 'job'): void {
  const s = store.getState()
  const g = GUIDE_STEPS.find((x) => x.id === id)
  if (!s || !g?.now || recorded(s, id) || !g.now(s)) return
  try {
    store.dispatch({ type: 'GUIDE_STEP', step: id })
  } catch {
    /* a refused write leaves the checklist as it was */
  }
}

/**
 * Run an action that can complete — or undo — a latching step (a party change, a job
 * change), latching the step on both sides of it: a party of five the tutorial set up is
 * remembered before the Master takes a hero out of it.
 */
export function latching<T>(store: Store, id: 'party' | 'job', act: () => T): T {
  recordStep(store, id)
  const out = act()
  recordStep(store, id)
  return out
}

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
