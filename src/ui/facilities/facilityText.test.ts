import { describe, expect, it } from 'vitest'
import { SKILLS } from '../../engine/content'
import { gradeDeltaLine, rescueLabel } from './facilityText'

describe('facility labels', () => {
  it('the Synthesis rescue reads as a skill name or a grade, never a raw id', () => {
    const id = Object.keys(SKILLS)[0]!
    expect(rescueLabel(`skill: ${id}`)).toBe(SKILLS[id]!.name)
    expect(rescueLabel('grade: str')).toBe('STR grade')
    expect(rescueLabel('skill: unknown_thing')).toBe('unknown_thing')
  })

  it('grade gains read as attribute labels', () => {
    expect(gradeDeltaLine({ str: 1, agi: 2 })).toBe('STR +1, AGI +2')
    expect(gradeDeltaLine({})).toBe('')
  })
})
