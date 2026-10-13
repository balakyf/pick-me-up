// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useVictoryAutoAdvance, victoryShown } from './autoAdvance'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

let show: (b: 'none' | 'win' | 'lose') => void = () => {}

function Host({ onFire, active = true }: { onFire: () => void; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [banner, setBanner] = useState<'none' | 'win' | 'lose'>('none')
  show = setBanner
  useVictoryAutoAdvance(ref, active, onFire)
  return <div ref={ref}>{banner !== 'none' && <div className={`battle-banner ${banner}`}>{banner}</div>}</div>
}

describe('victoryShown', () => {
  it('finds the victory banner (or a data marker), not a defeat', () => {
    const d = document.createElement('div')
    expect(victoryShown(d)).toBe(false)
    d.innerHTML = '<div class="battle-banner lose">DEFEAT</div>'
    expect(victoryShown(d)).toBe(false)
    d.innerHTML = '<div class="battle-banner win">VICTORY</div>'
    expect(victoryShown(d)).toBe(true)
    d.innerHTML = '<div data-battle-end="win"></div>'
    expect(victoryShown(d)).toBe(true)
    expect(victoryShown(null)).toBe(false)
  })
})

describe('useVictoryAutoAdvance', () => {
  it('advances 1.2 s after VICTORY appears, once', async () => {
    const fire = vi.fn()
    act(() => root.render(<Host onFire={fire} />))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(fire).not.toHaveBeenCalled()
    await act(async () => {
      show('win')
    })
    await act(async () => {
      vi.advanceTimersByTime(1100)
    })
    expect(fire).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(fire).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(fire).toHaveBeenCalledTimes(1)
  })

  it('leaves a defeat on screen', async () => {
    const fire = vi.fn()
    act(() => root.render(<Host onFire={fire} />))
    await act(async () => {
      show('lose')
    })
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(fire).not.toHaveBeenCalled()
  })

  it('does nothing while inactive', async () => {
    const fire = vi.fn()
    act(() => root.render(<Host onFire={fire} active={false} />))
    await act(async () => {
      show('win')
    })
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(fire).not.toHaveBeenCalled()
  })
})
