/**
 * How gear is named and its numbers read (lane N; itemLabel was the Armory's). Forged item
 * names come from the engine in English ("S Blade", "Aria's Oath-Blade", a masterwork's
 * "Bram's B Plate"), so they are translated piece by piece here.
 */
import type { EquipmentSlot } from '../../engine/types'
import type { ItemStatKey } from '../../engine/equipment'
import { t } from '../i18n/i18n'

export function itemLabel(name: string): string {
  const oath = /^(.+)'s Oath-(\w+)$/.exec(name)
  if (oath) return t("{who}'s Oath-{noun}", { who: oath[1]!, noun: t(oath[2]!) })
  const plain = /^(\S+) (Blade|Plate|Charm)$/.exec(name)
  if (plain) return t('{grade} {noun}', { grade: plain[1]!, noun: t(plain[2]!) })
  const master = /^(.+)'s (\S+) (Blade|Plate|Charm)$/.exec(name)
  if (master) return t("{who}'s {grade} {noun}", { who: master[1]!, grade: master[2]!, noun: t(master[3]!) })
  return t(name)
}

export const EQUIP_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'accessory']
export const SLOT_GLYPH: Record<EquipmentSlot, string> = { weapon: '⚔', armor: '🛡', accessory: '💍' }
export const SLOT_NAME: Record<EquipmentSlot, string> = { weapon: 'Weapon', armor: 'Body armor', accessory: 'Accessory' }

export const STAT_LABEL: Record<ItemStatKey, string> = {
  maxHP: 'HP',
  pAtk: 'P.ATK',
  mAtk: 'M.ATK',
  pDef: 'P.DEF',
  mDef: 'M.DEF',
  spd: 'SPD',
  critPct: 'CRIT',
  statusRes: 'RES',
}

/** "+12 P.ATK", "−3 SPD", "+4% CRIT". */
export function deltaText(key: ItemStatKey, delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  const pct = key === 'critPct' || key === 'statusRes' ? '%' : ''
  return `${sign}${Math.abs(delta)}${pct} ${t(STAT_LABEL[key])}`
}

/** "12 P.ATK", "4% CRIT". */
export function statText(key: ItemStatKey, v: number): string {
  const pct = key === 'critPct' || key === 'statusRes' ? '%' : ''
  return `${v}${pct} ${t(STAT_LABEL[key])}`
}
