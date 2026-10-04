/**
 * The save-error seam lane B left (`store.getSaveError()`), the pure half: when a failed
 * write should raise the notice (once per run of failures, not on every refused tick) and
 * when a successful write clears it. Lane K.
 */
export type SaveErrorChange = 'raise' | 'clear' | null

/** What a store notification means for the notice, given whether it is up now. */
export function saveErrorChange(showing: boolean, error: Error | null): SaveErrorChange {
  if (error !== null && !showing) return 'raise'
  if (error === null && showing) return 'clear'
  return null
}

/** Is the failure the browser's storage being full (the usual cause)? */
export function storageFull(error: Error): boolean {
  return /quota|full|exceeded/i.test(`${error.name} ${error.message}`)
}
