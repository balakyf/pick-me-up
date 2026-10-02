import { useEffect, useMemo, useReducer } from 'react'
import { cachedForecast, forecastInput, type Forecast, type ForecastAlternative, type ForecastPlan } from '../../engine/scout/forecast'
import type { GameState } from '../../engine/types'
import { cachedAlternatives, requestForecast } from './forecastClient'

export interface ForecastView {
  /** idle: nothing to forecast · pending: the crystal is working · alts: the forecast is in,
   *  the odds-changers are not yet · ready: everything is in. */
  status: 'idle' | 'pending' | 'alts' | 'ready'
  forecast: Forecast | null
  alternatives: ForecastAlternative[] | null
}

/** A stable key for a plan (the hook's memo). */
export function planKey(plan: ForecastPlan): string {
  return JSON.stringify([plan.slots ?? null, plan.lines ?? null, plan.opening ?? null, plan.ballista ?? null, plan.subvert ?? null])
}

/**
 * The war-room forecast for `plan` against the live account: read from the caches during
 * render (no flash when it is already known), asked of the crystal otherwise.
 */
export function useForecast(state: GameState | null, plan: ForecastPlan, enabled = true): ForecastView {
  const pk = planKey(plan)
  // The exact battle input (cheap: no battle is run) — its key is the memo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const input = useMemo(() => (enabled && state ? forecastInput(state, plan) : null), [enabled, state, pk])
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const forecast = input ? (cachedForecast(input) ?? null) : null
  const alternatives = input ? (cachedAlternatives(input.key) ?? null) : null
  const known = forecast !== null && alternatives !== null
  useEffect(() => {
    if (!input || !state || known) return
    const job = requestForecast(state, plan, input.key, bump)
    return () => job.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input?.key])
  return {
    status: !input ? 'idle' : forecast === null ? 'pending' : alternatives === null ? 'alts' : 'ready',
    forecast,
    alternatives,
  }
}
