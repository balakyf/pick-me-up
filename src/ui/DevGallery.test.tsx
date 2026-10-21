// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { DevGallery } from './DevGallery'
import { HERO_POSES } from './pixel/heroSprite'
import { ENEMY_TEMPLATES } from '../engine/content'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement | null = null
afterEach(() => {
  host?.remove()
  host = null
})

describe('DevGallery (?gallery)', () => {
  it('shows every hero pose and every enemy pose', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<DevGallery />))
    for (const p of HERO_POSES) expect(host.querySelectorAll(`img[title="${p}"]`).length).toBeGreaterThan(0)
    const enemies = Object.values(ENEMY_TEMPLATES)
    for (const p of ['windup', 'attack', 'cast', 'hurt', 'ko']) {
      expect(host.querySelectorAll(`img[alt$=" ${p}"]`).length).toBe(enemies.length)
    }
    expect(host.querySelectorAll('.blink-stack.idle-life').length).toBe(10)
    act(() => root.unmount())
  })
})
