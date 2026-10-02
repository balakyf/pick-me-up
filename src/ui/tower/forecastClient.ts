/**
 * Where the war-room forecast runs. A forecast is up to four dozen-odd real battles (the
 * floor, then each "what would change the odds" plan): cheap on most floors, but a long
 * survival floor runs to thousands of ticks a battle, so the work goes to a Web Worker and
 * the Tower screen never janks. If the browser refuses a worker, the battles are run a few
 * at a time between frames; with no Worker API at all (jsdom), they run at once.
 *
 * Every answer lands in the main thread's caches (the engine's forecast memo and the
 * alternatives map here), keyed on the exact battle input, so the screen reads it as soon
 * as it re-renders — and a plan the Master adopts ("Use this party") is already known.
 */
import {
  forecastAlternatives,
  forecastFloor,
  forecastInput,
  forecastRun,
  rememberForecast,
  summarizeForecast,
  type Forecast,
  type ForecastAlternative,
  type ForecastPlan,
  type ForecastRun,
} from '../../engine/scout/forecast'
import { FORECAST } from '../../engine/scout/forecastTuning'
import type { GameState } from '../../engine/types'

export type ForecastReply =
  | { id: number; kind: 'base'; forecast: Forecast | null }
  | { id: number; kind: 'alts'; alternatives: ForecastAlternative[] }
  | { id: number; kind: 'error'; message: string }

const ALTS = new Map<string, ForecastAlternative[]>()

/** The alternatives already known for a forecast key. */
export function cachedAlternatives(key: string): ForecastAlternative[] | undefined {
  return ALTS.get(key)
}

function rememberAlternatives(state: GameState, plan: ForecastPlan, key: string, alts: ForecastAlternative[]): void {
  if (ALTS.has(key)) ALTS.delete(key)
  ALTS.set(key, alts)
  while (ALTS.size > FORECAST.cacheSize) ALTS.delete(ALTS.keys().next().value!)
  // Each plan's forecast is known too: adopting one shows its numbers at once.
  for (const a of alts) {
    const input = forecastInput(state, { ...plan, slots: a.slots, lines: a.lines, opening: a.opening })
    if (input) rememberForecast(input.key, a.forecast)
  }
}

export interface ForecastJob {
  cancel(): void
}

interface Pending {
  key: string
  state: GameState
  plan: ForecastPlan
  onChange: () => void
  cancelled: boolean
}

let worker: Worker | null = null
let workerBroken = false
let busy = false
let nextId = 1
const jobs = new Map<number, Pending>()

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./forecast.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    workerBroken = true
    return null
  }
  worker.onmessage = (e: MessageEvent<ForecastReply>) => {
    const msg = e.data
    const job = jobs.get(msg.id)
    if (!job) return
    if (msg.kind === 'base') {
      if (msg.forecast) rememberForecast(job.key, msg.forecast)
      if (!job.cancelled) job.onChange()
      if (!msg.forecast) finish(msg.id)
    } else if (msg.kind === 'alts') {
      rememberAlternatives(job.state, job.plan, job.key, msg.alternatives)
      if (!job.cancelled) job.onChange()
      finish(msg.id)
    } else {
      finish(msg.id)
      // A broken run: answer on the main thread instead.
      if (!job.cancelled) runChunked(job)
    }
  }
  worker.onerror = () => {
    // The worker could not load (a strict browser, a file:// page): fall back for good.
    workerBroken = true
    worker?.terminate()
    worker = null
    busy = false
    const stranded = [...jobs.values()]
    jobs.clear()
    for (const j of stranded) if (!j.cancelled) runChunked(j)
  }
  return worker
}

function finish(id: number): void {
  jobs.delete(id)
  busy = jobs.size > 0
}

/** Run a job a few battles at a time between frames (no worker). */
function runChunked(job: Pending): void {
  const input = forecastInput(job.state, job.plan)
  if (!input) return
  const runs: ForecastRun[] = []
  let i = 0
  const fielded = input.prepared.battleUnits.length > 0
  const step = () => {
    if (job.cancelled) return
    const t0 = performance.now()
    while (fielded && i < input.runs && performance.now() - t0 < 8) runs.push(forecastRun(input, i++))
    if (fielded && i < input.runs) {
      setTimeout(step, 0)
      return
    }
    const f = summarizeForecast(input, runs)
    rememberForecast(input.key, f)
    job.onChange()
    setTimeout(() => {
      if (job.cancelled) return
      rememberAlternatives(job.state, job.plan, input.key, forecastAlternatives(job.state, f, job.plan))
      job.onChange()
    }, 0)
  }
  setTimeout(step, 0)
}

/**
 * Ask for the forecast (and its alternatives) of `plan`; `onChange` fires as each part lands
 * in the caches. `key` is the plan's forecastInput key.
 */
export function requestForecast(state: GameState, plan: ForecastPlan, key: string, onChange: () => void): ForecastJob {
  const job: Pending = { key, state, plan, onChange, cancelled: false }
  // No Worker API at all (a test DOM): answer at once.
  if (typeof Worker === 'undefined') {
    const f = forecastFloor(state, plan)
    if (f) rememberAlternatives(state, plan, key, forecastAlternatives(state, f, plan))
    onChange()
    return { cancel: () => {} }
  }
  const w = getWorker()
  if (!w) {
    runChunked(job)
    return { cancel: () => void (job.cancelled = true) }
  }
  // A busy worker is working on a plan nobody wants any more: start afresh.
  if (busy) {
    const stale = [...jobs.entries()].filter(([, j]) => j.cancelled)
    if (stale.length === jobs.size) {
      w.terminate()
      worker = null
      jobs.clear()
      busy = false
      return requestForecast(state, plan, key, onChange)
    }
  }
  const id = nextId++
  jobs.set(id, job)
  busy = true
  w.postMessage({ id, state, plan })
  return { cancel: () => void (job.cancelled = true) }
}

/** The forecast right now, on this thread (the Enter button cannot wait for the crystal). */
export function forecastNow(state: GameState, plan: ForecastPlan): Forecast | null {
  return forecastFloor(state, plan)
}
