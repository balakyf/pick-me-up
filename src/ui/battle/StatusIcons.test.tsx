// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { StatusIcons, orderedMarks } from './StatusIcons'
import type { UnitStatusView } from './statusCaptions'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null
function render(node: JSX.Element): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(node))
  return host
}
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
})

const view: UnitStatusView = {
  marks: [
    { key: 'atk-up', value: 20, sourceId: 'a' },
    { key: 'poison', value: 30, sourceId: 'b' },
    { key: 'shield', value: 150, sourceId: 'c' },
  ],
  pops: [{ unitId: 'u', text: '-30', cls: 'st-poison', seq: 7 }],
}

describe('StatusIcons', () => {
  it('draws an icon per status, dangers first, with a tooltip that says what it is', () => {
    const el = render(<StatusIcons view={view} />)
    const icons = Array.from(el.querySelectorAll('.st-icon'))
    expect(icons.map((i) => i.getAttribute('title'))).toEqual(['Poisoned', 'Shielded (150)', 'Attack up +20%'])
    expect(el.querySelectorAll('svg.st-glyph rect').length).toBeGreaterThan(3)
    expect(el.querySelector('.st-pop')?.textContent).toBe('-30')
  })

  it('the party-row form shows the icons only (no pops); nothing for the dead or the clean', () => {
    expect(render(<StatusIcons view={view} compact />).querySelector('.st-pop')).toBeNull()
    expect(render(<StatusIcons view={view} dead />).innerHTML).toBe('')
    expect(render(<StatusIcons view={{ marks: [], pops: [] }} />).innerHTML).toBe('')
  })

  it('keeps a crowded unit readable: at most four icons over the head, then a count', () => {
    const many = ['stun', 'burn', 'poison', 'bleed', 'guard-down', 'taunt'] as const
    const { shown, more } = orderedMarks(many.map((key) => ({ key, value: 1, sourceId: 'x' })), 4)
    expect(shown.map((m) => m.key)).toEqual(['stun', 'burn', 'poison', 'bleed'])
    expect(more).toBe(2)
  })
})
