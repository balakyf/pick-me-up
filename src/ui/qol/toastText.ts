/**
 * What a toast says: the visible effect of a command (the Daily claim, a banquet, one of
 * Isel's one-click actions) or of time passing (a building finished, a promotion done),
 * read by diffing the state before and after. Pure: the caller shows the result.
 */
import type { Command, FacilityId, GameState, HeroId, OwnedHero } from '../../engine/types'
import { GIFTS } from '../../engine/favor'
import { SKILLS } from '../../engine/content'
import { PLACE_LABEL } from '../world/lobbyMap'
import { JOB_NAME, shortName } from '../life/speech'
import { t } from '../i18n/i18n'
import { fmtInt, tn } from '../text'
import type { ToastTone } from './toastBus'

export interface ToastText {
  text: string
  icon: string
  tone?: ToastTone
}

function facilityName(f: FacilityId): string {
  return t((PLACE_LABEL as Record<string, string>)[f] ?? (f === 'forge' ? 'Forge' : f))
}

/** "+1,200 ◆ · +30 ♦" for what the Master's purse gained (or lost). */
function purseDelta(before: GameState, after: GameState): string {
  const parts: string[] = []
  const gold = after.gold - before.gold
  const gems = after.gems - before.gems
  if (gold !== 0) parts.push(`${gold > 0 ? '+' : '−'}${fmtInt(Math.abs(gold))} ◆`)
  if (gems !== 0) parts.push(`${gems > 0 ? '+' : '−'}${fmtInt(Math.abs(gems))} ♦`)
  return parts.join(' · ')
}

const hero = (s: GameState, id: HeroId): OwnedHero | undefined => s.heroes[id]

/** The toast for a command the Master just gave, or null when it says nothing new. */
export function describeCommand(before: GameState, after: GameState, cmd: Command): ToastText | null {
  switch (cmd.type) {
    case 'CLAIM_LOGIN': {
      const streak = after.meta.login?.streak ?? 0
      // The login pays gems only; gold that time paid on the same dispatch (a job's wage
      // landing at a slot boundary) is not the Daily's to claim.
      const purse = purseDelta(before, { ...after, gold: before.gold })
      return {
        icon: '🎁',
        text:
          streak > 1
            ? t('Daily reward: {loot} · {n}-day streak', { loot: purse, n: streak })
            : t('Daily reward: {loot}', { loot: purse }),
      }
    }
    case 'CLAIM_MONTHLY':
      return { icon: '📅', text: t('Monthly Package: {loot}', { loot: purseDelta(before, after) }) }
    case 'BUY_PACKAGE': {
      const purse = purseDelta(before, after)
      return purse ? { icon: '♦', text: t('Purchased: {loot}', { loot: purse }) } : null
    }
    case 'BANQUET': {
      const living = (Object.values(after.heroes) as OwnedHero[]).filter((h) => h.alive)
      let restored = 0
      let fed = 0
      for (const h of living) {
        const was = before.heroes[h.id]?.sanity ?? h.sanity
        if (h.sanity > was) {
          fed++
          restored = Math.max(restored, Math.round(h.sanity - was))
        }
      }
      return {
        icon: '🍴',
        text:
          fed === 0
            ? t('A banquet in the Kitchen. Nobody needed it, but nobody complained.')
            : tn(fed, 'A banquet! 1 hero eats well: up to +{s} Sanity.', 'A banquet! {n} heroes eat well: up to +{s} Sanity.', { s: restored }),
      }
    }
    case 'ASSIGN_JOB': {
      const name = shortName(after, cmd.heroId)
      return cmd.job
        ? { icon: '🧰', text: t('{name} takes the job: {job}.', { name, job: t(JOB_NAME[cmd.job]) }) }
        : { icon: '🧰', text: t('{name} has no job now.', { name }), tone: 'info' }
    }
    case 'EQUIP_ITEM': {
      const item = after.inventory.find((i) => i.id === cmd.itemId)
      return { icon: '⚔', text: t('{name} equips {item}.', { name: shortName(after, cmd.heroId), item: item ? t(item.name) : t('an item') }) }
    }
    case 'GIVE_GIFT': {
      const g = GIFTS[cmd.giftId]
      const h = hero(after, cmd.heroId)
      const gained = h ? Math.round(h.favor - (hero(before, cmd.heroId)?.favor ?? h.favor)) : 0
      return {
        icon: '🎀',
        text:
          gained > 0
            ? t('{name} accepts the {gift}: +{n} favor.', { name: shortName(after, cmd.heroId), gift: t(g?.name ?? cmd.giftId), n: gained })
            : t('{name} accepts the {gift}.', { name: shortName(after, cmd.heroId), gift: t(g?.name ?? cmd.giftId) }),
      }
    }
    case 'PROMOTE_HERO': {
      const h = hero(after, cmd.heroId)
      if (!h) return null
      return h.promotion
        ? { icon: '⬆', text: t('{name} enters the Promotion Chamber.', { name: shortName(after, cmd.heroId) }) }
        : { icon: '⬆', text: t('{name} rises to {n}★!', { name: shortName(after, cmd.heroId), n: h.star }) }
    }
    case 'TRAIN_SKILL':
      return {
        icon: '🎯',
        text: t('{name} starts a drill: {skill}.', { name: shortName(after, cmd.heroId), skill: t(SKILLS[cmd.skillId]?.name ?? cmd.skillId) }),
      }
    case 'SET_PARTY': {
      const n = cmd.slots.filter(Boolean).length
      return { icon: '👥', text: tn(n, 'Party set: 1 hero.', 'Party set: {n} heroes.'), tone: 'info' }
    }
    case 'UPGRADE_FACILITY': {
      const f = after.facilities[cmd.facility]
      const was = before.facilities[cmd.facility]
      const name = facilityName(cmd.facility)
      if (f.build) return { icon: '🔨', text: was.level === 0 ? t('Work begins on the {place}.', { place: name }) : t('The {place} is being upgraded to Lv {n}.', { place: name, n: f.build.toLevel }) }
      return { icon: '🔨', text: t('The {place} is now Lv {n}.', { place: name, n: f.level }) }
    }
    default:
      return null
  }
}

/** What changed on its own between two moments of the same account (time passing). */
export function describeTime(before: GameState, after: GameState): ToastText[] {
  if (before.accountId !== after.accountId) return []
  const out: ToastText[] = []
  for (const f of Object.keys(after.facilities) as FacilityId[]) {
    const a = after.facilities[f]
    const b = before.facilities[f]
    if (b && b.build !== null && a.build === null && a.level > b.level) {
      out.push({ icon: '🏛', text: b.level === 0 ? t('The {place} is built!', { place: facilityName(f) }) : t('The {place} reached Lv {n}.', { place: facilityName(f), n: a.level }) })
    }
  }
  for (const h of Object.values(after.heroes) as OwnedHero[]) {
    const was = before.heroes[h.id]
    if (!was || !h.alive) continue
    if (was.promotion !== null && h.promotion === null && h.star > was.star) {
      out.push({ icon: '⬆', text: t('{name} rises to {n}★!', { name: shortName(after, h.id), n: h.star }) })
    }
    if (was.training !== null && h.training === null) {
      const skill = SKILLS[was.training.skillId]?.name ?? was.training.skillId
      out.push({ icon: '🎯', text: t('{name} finished a drill: {skill}.', { name: shortName(after, h.id), skill: t(skill) }) })
    }
  }
  return out
}
