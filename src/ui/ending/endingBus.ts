/**
 * Open the ending from anywhere (lane O): the Tower after the F90 results, or the Menu to
 * replay it. `EndingHost` (mounted once in App) listens. The `sheetBus` pattern.
 */
type Listener = (req: EndingRequest) => void

export interface EndingRequest {
  /** 'epilogue' plays the stills, then the credits; 'credits' goes straight to the roll. */
  start: 'epilogue' | 'credits'
}

const listeners = new Set<Listener>()

export function openEnding(req: EndingRequest = { start: 'epilogue' }): void {
  for (const l of listeners) l(req)
}

export function onEnding(l: Listener): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
