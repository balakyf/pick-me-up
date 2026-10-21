// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { countUpValue, useCountUp } from './useCountUp'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('countUpValue', () => {
  it('starts at from, lands exactly on to, and never overshoots on the way', () => {
    for (const [from, to] of [
      [0, 480],
      [0, 7],
      [1200, 15_300],
      [50, 3],
    ] as [number, number][]) {
      expect(countUpValue(from, to, 0)).toBe(from)
      expect(countUpValue(from, to, 1)).toBe(to)
      expect(countUpValue(from, to, 1.5)).toBe(to)
      let prev: number = from
      for (let p = 0.05; p < 1; p += 0.05) {
        const v = countUpValue(from, to, p)
        expect(Number.isInteger(v)).toBe(true)
        if (to >= from) {
          expect(v).toBeGreaterThanOrEqual(prev)
          expect(v).toBeLessThanOrEqual(to)
        } else {
          expect(v).toBeLessThanOrEqual(prev)
          expect(v).toBeGreaterThanOrEqual(to)
        }
        prev = v
      }
    }
  })
  it('eases out: most of the count happens early', () => {
    expect(countUpValue(0, 1000, 0.5)).toBeGreaterThan(800)
  })
})

describe('useCountUp', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function Counter({ to, animate = true, onStep }: { to: number; animate?: boolean; onStep?: (i: number) => void }) {
    const v = useCountUp(to, { animate, durationMs: 600, delayMs: 100, onStep })
    return <span>{v}</span>
  }

  it('counts up from 0 and reaches the exact value', () => {
    const steps: number[] = []
    act(() => root.render(<Counter to={1234} onStep={(i) => steps.push(i)} />))
    expect(container.textContent).toBe('0')
    act(() => {
      vi.advanceTimersByTime(350)
    })
    const mid = Number(container.textContent)
    expect(mid).toBeGreaterThanOrEqual(0)
    expect(mid).toBeLessThanOrEqual(1234)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(container.textContent).toBe('1234')
    expect(steps.length).toBeGreaterThan(0)
  })

  it('shows the final value at once when not animated (reduced motion)', () => {
    act(() => root.render(<Counter to={999} animate={false} />))
    expect(container.textContent).toBe('999')
  })
})
