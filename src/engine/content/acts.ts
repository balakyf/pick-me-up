/**
 * The tower's acts (Layer 2 §2.1 band table): floor ranges, filler pools and the
 * filler mission mix. Anchors live in `anchors`; this is the "between" content.
 */

export type ActMissionMix = 'prairie' | 'ruins' | 'late' | 'coast' | 'wall'

export interface ActDef {
  id: string
  title: string
  subtitle: string
  from: number
  to: number
  /** Filler enemy template ids. */
  pool: readonly string[]
  /** How filler floors in this act pick their mission. */
  missions: ActMissionMix
}

export const ACTS: readonly ActDef[] = [
  {
    id: 'prairie',
    title: 'Act I — The Prairie',
    subtitle: 'goblins, wolves, harpies · the falling city at F10',
    from: 1,
    to: 10,
    pool: ['goblin', 'wolf', 'harpy'],
    missions: 'prairie',
  },
  {
    id: 'ruins',
    title: 'Act II — The Ruins',
    subtitle: 'undead, soldiers, assassins · Halgiraf at F20',
    from: 11,
    to: 20,
    pool: ['skeleton', 'soldier', 'dark_mage', 'assassin', 'knight'],
    missions: 'ruins',
  },
  {
    id: 'swamp',
    title: 'Act III — The Swamp',
    subtitle: 'lizardmen and golems · the escape at F25 · the stone statue at F30',
    from: 21,
    to: 30,
    pool: ['lizardman', 'lizard_shaman', 'lizard_rider', 'mud_golem'],
    missions: 'late',
  },
  {
    id: 'coast',
    title: 'Act IV — The Drowned Coast',
    subtitle: 'sharks, mermen, kraken · the water dragon Kthat at F35',
    from: 31,
    to: 35,
    pool: ['shark', 'merman', 'kraken_spawn', 'guardian_golem'],
    missions: 'coast',
  },
  {
    id: 'order',
    title: "Act V — The Order's War",
    subtitle: 'the F36–40 loop · Versace at F41 · the tournament · El Cid at F60',
    from: 36,
    to: 69,
    pool: ['order_soldier', 'dark_knight', 'demon_marksman', 'order_mage'],
    missions: 'late',
  },
  {
    id: 'inflection',
    title: 'Act VI — The Inflection',
    subtitle: 'chimeras and wraiths · the curve steepens',
    from: 70,
    to: 79,
    pool: ['chimera', 'wraith', 'dark_knight', 'demon_marksman'],
    missions: 'late',
  },
  {
    id: 'wall',
    title: 'Act VII — The Wailing Wall',
    subtitle: 'the Fragment Series, the same for every Master · Pryos Al Ragna at F80',
    from: 80,
    to: 89,
    pool: ['fragment_shard', 'fragment_knight', 'fragment_warden'],
    missions: 'wall',
  },
  {
    id: 'void',
    title: 'Act VIII — The Unfinished Floors',
    subtitle: 'the ninetieth floor ends the world · the summit at F100',
    from: 90,
    to: 100,
    pool: ['void_spawn', 'abyss_knight', 'fragment_warden'],
    missions: 'late',
  },
]

/** The act a floor belongs to (floors past the top clamp to the last act). */
export function actForFloor(floor: number): ActDef {
  return ACTS.find((a) => floor >= a.from && floor <= a.to) ?? ACTS[ACTS.length - 1]!
}
