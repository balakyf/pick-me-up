// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LivingSprite } from './LivingSprite'
import { idlePhase } from './poses'

describe('LivingSprite', () => {
  it('breathes and blinks on the unit\'s own phase', () => {
    const html = renderToStaticMarkup(<LivingSprite id="h_000009" src="a.png" blinkSrc="b.png" width={72} height={96} />)
    const p = idlePhase('h_000009')
    expect(html).toContain('blink-stack idle-life')
    expect(html).toContain(`--idle-delay:${p.breathDelayMs}ms`)
    expect(html).toContain(`--blink-period:${p.blinkEveryMs}ms`)
    expect(html).toContain('class="px blink"')
    expect(html).toContain('src="b.png"')
  })

  it('a still sprite (KO, posed, reduced motion) neither breathes nor blinks', () => {
    const html = renderToStaticMarkup(<LivingSprite id="h_000009" src="a.png" blinkSrc="b.png" width={72} height={96} still />)
    expect(html).not.toContain('idle-life')
    expect(html).not.toContain('blink"')
    expect(html).not.toContain('--idle-delay')
  })
})
