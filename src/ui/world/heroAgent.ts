/**
 * Where on the campus a hero goes to do what their Quanton Life says they are doing.
 * The engine decides WHAT (sleep, forge, drink, mourn…) and in which building; this
 * picks the exact spot — their own bed, a stool at the tavern, the anvil, the grave of
 * the friend they lost — so the lobby shows the life the engine simulates. Cosmetic
 * and deterministic per hero (spots are hashed so heroes spread out naturally).
 */
import type { GameState, HeroActivity, HeroId, LifePlace, OwnedHero } from '../../engine/types'
import { bedIndex, lifeOf, personalityOf, salientMemories, dayOfSlot } from '../../engine/life'
import { hashString } from '../pixel/rand'
import {
  PROPS,
  ROOMS,
  graveTile,
  isAdjacentTo,
  isWalkable,
  propsInRoom,
  walkableTilesIn,
  type Prop,
  type PropKind,
  type Pt,
  type RoomId,
} from './lobbyMap'

export const PLACE_ROOM: Record<LifePlace, RoomId> = {
  dormitory: 'dormitory',
  hall: 'hall',
  kitchen: 'kitchen',
  forge: 'armory',
  yard: 'training',
  tavern: 'tavern',
  library: 'library',
  promotion: 'promotionChamber',
  memorial: 'memorial',
  infirmary: 'infirmary',
  garden: 'garden',
  market: 'market',
  watchtower: 'watchtower',
  courtyard: 'courtyard',
  rift: 'magic',
  offsite: 'magic',
}

export interface Spot {
  /** Stand here (a walkable tile). */
  at: Pt
  /** Face this prop on arrival. */
  face?: Prop
  /** Lie down on this tile once arrived (a bed or a cot). */
  lie?: Pt
  /** Draw a bedroll (sleeping without a bed). */
  bedroll?: boolean
  /** Vanish on arrival (through the Crack of Time, or taken). */
  vanish?: boolean
}

const BEDS = PROPS.filter((p) => p.kind === 'bed')

function adjacentWalkable(p: Prop): Pt[] {
  const out: Pt[] = []
  for (let y = p.y - 1; y <= p.y + p.h; y++)
    for (let x = p.x - 1; x <= p.x + p.w; x++) if (isAdjacentTo(p, x, y) && isWalkable(x, y)) out.push({ x, y })
  return out
}

function pickFrom<T>(arr: T[], seed: string): T | undefined {
  return arr.length ? arr[hashString(seed) % arr.length] : undefined
}

/** A spot next to one of `kinds` inside `room`, spread by the hero's id. */
function atProp(room: RoomId, kinds: PropKind[], seed: string): Spot | null {
  const props = propsInRoom(room).filter((p) => kinds.includes(p.kind))
  const prop = pickFrom(props, seed)
  if (!prop) return null
  const tile = pickFrom(adjacentWalkable(prop), seed + '|t')
  return tile ? { at: tile, face: prop } : null
}

function anywhere(room: RoomId, seed: string): Spot {
  const tiles = walkableTilesIn(room)
  return { at: pickFrom(tiles, seed) ?? { x: ROOMS.hall.x + 5, y: ROOMS.hall.y + 5 } }
}

const HOBBY_PROPS: Record<string, PropKind[]> = {
  gardening: ['crop'],
  reading: ['bookcase', 'lectern', 'desk'],
  sparring: ['dummy'],
  music: ['table', 'bar', 'bench', 'fountain'],
  cards: ['table'],
  carving: ['bench', 'fountain'],
  stargazing: ['bench', 'fountain', 'telescope'],
  cooking: ['hearth', 'table'],
}

const JOB_PROPS: Record<string, PropKind[]> = {
  blacksmith: ['forge', 'anvil'],
  cook: ['hearth', 'table'],
  instructor: ['dummy', 'drillBoard'],
  scholar: ['desk', 'bookcase'],
  healer: ['cot'],
  gardener: ['crop', 'well'],
  merchant: ['marketStall'],
  guard: ['telescope', 'weaponRack'],
}

/** Where `hero` should be for `doing`. `salt` varies the spot when they fidget. */
export function spotFor(state: GameState, hero: OwnedHero, doing: HeroActivity, salt = ''): Spot {
  const room = PLACE_ROOM[doing.place]
  const seed = `${hero.id}|${doing.kind}|${salt}`
  const life = lifeOf(hero)
  switch (doing.kind) {
    case 'sleep': {
      const bi = bedIndex(state, hero.id)
      if (doing.place === 'dormitory' && bi !== null && bi < BEDS.length) {
        const bedP = BEDS[bi]!
        const side = adjacentWalkable(bedP)
        return { at: side[0] ?? { x: bedP.x, y: bedP.y + 2 }, face: bedP, lie: { x: bedP.x, y: bedP.y } }
      }
      const s = anywhere(room, seed)
      return { at: s.at, lie: s.at, bedroll: true }
    }
    case 'work': {
      const kinds = life.job ? JOB_PROPS[life.job] : undefined
      return (kinds && atProp(room, kinds, seed)) ?? anywhere(room, seed)
    }
    case 'eat':
      return atProp('kitchen', ['table'], seed) ?? anywhere(room, seed)
    case 'train':
    case 'drilling':
      return atProp('training', ['dummy'], seed) ?? anywhere('training', seed)
    case 'socialize':
      return atProp(room, room === 'tavern' ? ['table', 'bar'] : ['lectern', 'stall', 'summonCrystal'], seed) ?? anywhere(room, seed)
    case 'hobby': {
      const kinds = HOBBY_PROPS[personalityOf(hero).hobby] ?? []
      return atProp(room, kinds, seed) ?? anywhere(room, seed)
    }
    case 'read':
      return atProp(room, ['bookcase', 'desk', 'lectern'], seed) ?? anywhere(room, seed)
    case 'pray':
    case 'promoting':
      return atProp(room, ['altar', 'summonCrystal'], seed) ?? anywhere(room, seed)
    case 'heal': {
      const cots = propsInRoom('infirmary', 'cot')
      const cot = pickFrom(cots, seed)
      if (cot) return { at: adjacentWalkable(cot)[0] ?? { x: cot.x, y: cot.y + 2 }, face: cot, lie: { x: cot.x, y: cot.y } }
      return anywhere(room, seed)
    }
    case 'mourn': {
      // Stand at the grave of the friend they lost (when it is one of the visible twelve).
      const lost = salientMemories(life, dayOfSlot(state.life.slot)).find((m) => m.kind === 'friendDied' || m.kind === 'comradeDied')
      const graves = state.life.memorial
      const idx = lost ? graves.findIndex((g) => g.heroId === lost.other) : -1
      const shown = idx - Math.max(0, graves.length - 12)
      const g = shown >= 0 ? graveTile(shown) : null
      if (g) {
        const below = { x: g.x, y: g.y + 1 }
        if (isWalkable(below.x, below.y)) return { at: below, face: { kind: 'grave', x: g.x, y: g.y, w: 1, h: 1 } }
      }
      return atProp('memorial', ['obelisk'], seed) ?? anywhere('memorial', seed)
    }
    case 'away':
    case 'captive': {
      const s = atProp('magic', ['rift'], seed) ?? anywhere('magic', seed)
      return { ...s, vanish: true }
    }
    case 'wander': {
      const rooms: RoomId[] = ['courtyard', 'market', 'courtyard', 'hall']
      const r = rooms[hashString(seed) % rooms.length]!
      return anywhere(r, seed)
    }
  }
}

/** Heroes off the campus are not drawn once they arrive. */
export function isOffsite(hero: OwnedHero): boolean {
  return Boolean(hero.expedition || hero.captiveOf)
}

export function activityKey(d: HeroActivity): string {
  return `${d.kind}|${d.place}|${d.with ?? ''}`
}

export type { HeroId }
