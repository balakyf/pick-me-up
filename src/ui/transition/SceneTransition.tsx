/**
 * The scene curtain (lane K): mount it once where scenes change and pass the scene on
 * screen; when it changes, a pixel curtain covers the new scene at once and opens onto it
 * (transition.ts decides the style and the timing). It never blocks a click (the curtain
 * is pointer-events: none) and it goes away by itself.
 *
 * `channel` keeps each mount's memory of the last scene apart (the App's scenes and the
 * Tower's battle/results), and survives the App swapping its whole tree (title → lobby).
 */
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useReducedMotion } from '../motion'
import { blockMs, curtainDelays, curtainGrid, transitionFor, type Scene, type TransitionPlan } from './transition'
import './transition.css'

const lastScene = new Map<string, Scene>()

/** Forget every channel's last scene (tests; a reset save). */
export function resetTransitions(): void {
  lastScene.clear()
}

interface Run {
  id: number
  plan: TransitionPlan
  cols: number
  rows: number
}

let runIds = 0

export function SceneTransition({ scene, channel = 'app' }: { scene: Scene; channel?: string }) {
  const reduced = useReducedMotion()
  const [run, setRun] = useState<Run | null>(null)
  // Before paint: the curtain must be up in the same frame the new scene first shows.
  useLayoutEffect(() => {
    const from = lastScene.get(channel) ?? null
    lastScene.set(channel, scene)
    const plan = transitionFor(from, scene, reduced)
    if (plan.style === 'none') return
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280
    const h = typeof window !== 'undefined' ? window.innerHeight : 800
    const { cols, rows } = curtainGrid(w, h)
    setRun({ id: ++runIds, plan, cols, rows })
    // Only a scene change starts a curtain (a motion-setting change mid-scene does not).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, channel])
  useEffect(() => {
    if (!run) return
    const id = run.id
    const tm = setTimeout(() => setRun((r) => (r && r.id === id ? null : r)), run.plan.ms + 60)
    return () => clearTimeout(tm)
  }, [run])
  const delays = useMemo(() => (run ? curtainDelays(run.plan, run.cols, run.rows) : []), [run])
  if (!run) return null
  if (run.plan.style === 'fade') return <div key={run.id} className="scene-curtain fade" style={{ animationDuration: `${run.plan.ms}ms` }} aria-hidden="true" />
  const dur = blockMs(run.plan)
  return (
    <div
      key={run.id}
      className={`scene-curtain ${run.plan.style}`}
      style={{ gridTemplateColumns: `repeat(${run.cols}, 1fr)`, gridTemplateRows: `repeat(${run.rows}, 1fr)` }}
      aria-hidden="true"
    >
      {delays.map((d, i) => (
        <span key={i} className="cb" style={{ animationDelay: `${d}ms`, animationDuration: `${dur}ms` }} />
      ))}
    </div>
  )
}
