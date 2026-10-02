/**
 * The crystal, off the main thread: runs the war-room forecast (engine/scout/forecast.ts)
 * so a long survival floor's sixty-odd battles never jank the Tower screen. One request
 * at a time; the page ignores answers it no longer wants (and replaces a busy worker).
 */
import { forecastAlternatives, forecastFloor, type ForecastPlan } from '../../engine/scout/forecast'
import type { GameState } from '../../engine/types'
import type { ForecastReply } from './forecastClient'

interface Req {
  id: number
  state: GameState
  plan: ForecastPlan
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Req>) => void) | null; postMessage: (m: ForecastReply) => void }

ctx.onmessage = (e) => {
  const { id, state, plan } = e.data
  try {
    const forecast = forecastFloor(state, plan)
    ctx.postMessage({ id, kind: 'base', forecast })
    const alternatives = forecast ? forecastAlternatives(state, forecast, plan) : []
    ctx.postMessage({ id, kind: 'alts', alternatives })
  } catch (err) {
    ctx.postMessage({ id, kind: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
