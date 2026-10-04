/**
 * Hidden objectives (Layer 2 §5.3): conditions beyond a floor's stated goal, often tied
 * to the cause of the world's destruction. They are never shown until found (a Master
 * with the half-Master's sight sees a hint). Each pays out once and adds a line to the
 * Chronicle — together they foreshadow what clearing F90 does.
 */

import type { HiddenObjective } from '../types'
import { TUNING } from '../tuning'

export const HIDDEN_OBJECTIVES: readonly HiddenObjective[] = [
  {
    id: 'priest_before_fall',
    floor: 10,
    name: 'The Priest Before the Fall',
    hint: 'End the defense before the thing in the third wave wakes.',
    condition: { kind: 'swift', ticks: 300 },
    reward: { gems: 15 },
    lore: 'The Black Priest prayed to no god of this world. His prayers were answered anyway.',
  },
  {
    id: 'princess_unscathed',
    floor: 15,
    name: 'Not a Scratch',
    hint: 'Bring the princess out with most of her strength.',
    condition: { kind: 'escortHp', targetTag: 'priasis', pct: 60 },
    reward: { gems: 15, materials: { promotionStone: 2 } },
    lore: 'Priasis remembers a sky with two suns. No one else in her kingdom does.',
  },
  {
    id: 'before_the_rage',
    floor: 20,
    name: 'Before the Rage',
    hint: 'Fell the dragon before his fury rises.',
    condition: { kind: 'swift', ticks: TUNING.tower.f20EnrageTick },
    reward: { gems: 20 },
    lore: "Halgiraf's scales are older than the continent. Something sent him to guard this floor.",
  },
  {
    id: 'void_key',
    floor: 30,
    name: 'The Void Key',
    hint: 'Break the statue without losing anyone.',
    condition: { kind: 'flawless' },
    reward: { gems: 20, materials: { promotionStone: 3 } },
    lore: 'The statue was not built to guard the tower. It was built to keep something inside it.',
  },
  {
    id: 'hunt_of_the_water_god',
    floor: 35,
    name: 'Hunt of the Water God',
    hint: 'Kthat must fall before the jewel is taken.',
    condition: { kind: 'defeat', targetTag: 'kthat' },
    reward: { gems: 30 },
    lore: 'Kthat was worshipped as a god. Gods of a dying world are only its last defenders.',
  },
  {
    id: 'iron_blood_unbroken',
    floor: 40,
    name: 'Iron Blood, Unbroken',
    hint: 'Break the loop without a single fallen hero.',
    condition: { kind: 'flawless' },
    reward: { gems: 30 },
    lore: 'The loop is not a trap. It is the world trying to hold the Master back.',
  },
  // Lane P · the F45 key's payoff: the lock it turned is Priasis's vault, two floors up.
  {
    id: 'her_key',
    floor: 47,
    name: 'Her Key',
    hint: 'Open the door the key unlocked.',
    condition: { kind: 'defeat', targetTag: 'ragna_vault' },
    reward: { gems: 30, materials: { promotionStone: 2 } },
    lore: 'The Al Ragna came down from a world that ended when its Master cleared the ninetieth floor. Taonier was built by survivors.',
  },
  {
    id: 'the_egg_unhatched',
    floor: 50,
    name: 'Unhatched',
    hint: 'Destroy the Egg quickly, while the object still stands strong.',
    condition: { kind: 'escortHp', targetTag: 'sealed_object', pct: 75 },
    reward: { gems: 40, materials: { promotionStone: 4 } },
    lore: 'The Sealed Object is a piece of the world’s core. The Egg was feeding on it.',
  },
  {
    id: 'fallen_ranker',
    floor: 60,
    name: 'A Ranker’s Rest',
    hint: 'Fell El Cid before he stops holding back.',
    condition: { kind: 'swift', ticks: 600 },
    reward: { gems: 50 },
    lore: 'El Cid was a Master once. The book he carried let him walk into his own game.',
  },
  {
    id: 'wall_witness',
    floor: 80,
    name: 'Witness at the Wall',
    hint: 'Stand before the Fragment Series and lose no one.',
    condition: { kind: 'flawless' },
    reward: { gems: 80 },
    lore: 'The Fragments are the weakest of what waits past the ninetieth floor.',
  },
  {
    id: 'the_last_truth',
    floor: 89,
    name: 'The Last Truth',
    hint: 'Climb the last floor before the end without a single loss.',
    condition: { kind: 'flawless' },
    reward: { gems: 100 },
    lore: 'Every Master who clears the ninetieth floor ends the world they climbed. The game never said so.',
  },
]
