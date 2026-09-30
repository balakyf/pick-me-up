/**
 * Relationship synergy (combat depth §1): the Quanton Life affinity between two party
 * members, read once at battle start and carried into combat as CombatBonds — so combat
 * stays a pure function of its inputs. PURE.
 */
import type { BondKind, CombatBond, Encounter, GameState, HeroId } from '../types'
import { bondOf, relationKey } from '../life/life'

/** Friends cover and follow up; rivals compete. */
export function isFriendly(kind: BondKind): boolean {
  return kind === 'friend' || kind === 'closeFriend'
}

/** Every bonded pair among these heroes (stable order: by id pair). */
export function partyBonds(state: GameState, heroIds: readonly HeroId[]): CombatBond[] {
  const ids = [...heroIds].sort()
  const out: CombatBond[] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const rel = state.life.relations[relationKey(ids[i]!, ids[j]!)]
      if (!rel) continue
      const kind = bondOf(rel.affinity)
      if (kind !== null) out.push({ a: ids[i]!, b: ids[j]!, kind, affinity: rel.affinity })
    }
  }
  return out
}

/** The encounter with the deployed party's bonds attached (unchanged when there are none). */
export function withBonds(enc: Encounter, state: GameState, heroIds: readonly HeroId[]): Encounter {
  const bonds = partyBonds(state, heroIds)
  return bonds.length > 0 ? { ...enc, bonds } : enc
}

/** The deployable party's hero ids, in slot order (what `partyBonds` reads for the UI). */
export function partyIds(state: GameState): HeroId[] {
  return state.party.slots.filter((id): id is HeroId => !!id && !!state.heroes[id]?.alive)
}
