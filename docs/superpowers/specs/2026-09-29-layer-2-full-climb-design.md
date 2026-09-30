# Layer 2 — The Full Climb (F21–100) · Vertical-Slice Spec

> **Status:** Design · **Date:** 2026-09-29 · **Owner layer:** Layer 2 (content & encounters).
> **Follows:** Act II (`2026-09-29-act-ii-ruins-design.md`), which opened the tower to F20 and
> deferred Act III onward, event floors and raid rewards.
> **Closes:** every Layer 2 system still unbuilt: the remaining mission primitives, event
> floors, the F36–40 loop, hidden objectives, the F80 wall, the F90 world-destruction twist,
> the F41/42 tournament and the F100 summit.

## Canon anchors (inviolable)

Townia/Taoni floor logs (bible): F25 Escape protecting Priasis · F30 Explore, Kurushahr and the
ancient stone statue (Void Key) · F31–35 aquatic Seizure, F35 Capture of the blue jewel guarded
by the water dragon **Kthat**, with the hidden "Hunt of the Water God" · **F36–40 Looped
mission, 5 attempts; failing F40 drops the room back to F31** · F40 **Valention of Iron Blood**
with Rodvick (strength) and Lazenca (speed) · F41 Chase, **Versace of Silver Lightning** · F41/42
Tournament (Battle Royale, Party Raid, Team, Pair, Deathmatch; ranked) · F42 **Darkan of
Destruction** · F45 Delivery of the key · F50 Complex (protect the object, destroy the Egg) ·
F70 inflection · **F80 the Wailing Wall: the Fragment Series for every account; boss Pryos Al
Ragna** · late-80s bosses ≈ Lv250 · **clearing F90 unconditionally destroys the world** · 100
floors, F100 the summit.

## Decisions

| Question | Choice |
|---|---|
| "Reach/Escape" with no battle map | A **Reach(distance)** objective: every hero action (even one with nothing to hit) moves the party one step toward the exit. It turns escape into a race: survive long enough to cover the distance. |
| Acquire/Seizure | **Acquire(targetTag)**: the tagged carrier falls and the item is taken. Once taken the mission is won, so anything *optional* (Kthat) has to be hunted **first**, which is what the Tactical Center's focus lever is for. |
| Chase / Delivery / Complex / Domination | Built from existing pieces: Chase = Defeat + a short timer against a fast target; Delivery = Protect(courier) + Reach; Complex = Protect(object) + Defeat(Egg); Domination = Defend(4 waves). |
| The loop (canon vs Layer 2 spec) | Canon wins: failing the **F40 gate** drops the tower back to **F31**, costing one of 5 attempts. When the attempts run out the loop hardens: +1 *scar* (F36–40 enemies gain levels) and the attempts refill. Failing F36–39 is an ordinary retry. |
| Tournament without PvP | Rival Masters' parties are **seeded ghost parties** tuned against your party's CP. Layer 4 will swap real matchmaking in. Tournament fights are **non-lethal**. |
| F90 | Clearing F90 sets `worldEnded`. The climb continues into the **Unfinished Floors** (F91–99, a glitched void), and the tower screen and the Chronicle mark the world as lost. Hidden objectives are the lore that foreshadows it; the Chronicle shows how many truths you found. |
| Book of Reverse Heaven | A second Book drops from **El Cid** (F60 raid boss; canon "dropped after defeating El Cid"). |

## 1. Acts (filler pools, Layer 2 §2.1)

| Floors | Act | Filler pool | Missions |
|---|---|---|---|
| 21–29 | III — The Swamp | lizardman, lizard shaman, lizard rider, mud golem | Subjugation · Survival · Escape |
| 31–35 | IV — The Drowned Coast | man-eater shark, tainted merman, kraken spawn, guardian golem | Subjugation · Seizure |
| 36–69 | V — The Order's War | order soldier, dark knight, demon marksman, order mage | Subjugation · Chase · Escape |
| 70–79 | VI — The Inflection | chimera, wraith, dark knight, demon marksman | Subjugation · Survival |
| 80–89 | VII — The Wailing Wall | fragment shard, fragment knight, fragment warden | Conquest. **Shared seed for every account.** |
| 91–99 | VIII — The Unfinished Floors | void spawn, abyss knight, fragment warden | Subjugation · Survival |

`mobLevel` gains `inflectionLevelPerFloor` extra levels per floor past F70, so F80 ≈ Lv108 and
F90 ≈ Lv135 in a C world. Anchor bosses add their own level bonus (late-80s ≈ Lv250).

## 2. Anchors

| F | Mission | Content |
|---|---|---|
| 25 | Escape | reach + protect Priasis; lizardmen, then the Lizard Chief |
| 30 | Explore | mage golems + Kurushahr, then the Ancient Stone Statue (magic-immune until its two crystal cores fall; `phased`) |
| 35 | Capture | sharks + mermen, then the jewel guardian (`blue_jewel`) + **Kthat** + a kraken; acquire(blue_jewel) |
| 40 | Loop gate | Rodvick + Lazenca, then **Valention of Iron Blood**; defeat(valention) |
| 41 | Chase | scattered soldiers + **Versace** (very fast); defeat(versace) inside 420 ticks |
| 42 | Subjugation | **Darkan of Destruction** + guards |
| 45 | Delivery | protect the key bearer + reach |
| 50 | Complex | protect the Sealed Object + defeat the Egg (phased behind its brood) |
| 55 | Defend | the Order's siege, 3 waves |
| 60 | Raid | **El Cid**, fallen ranker; first clear drops a **Book of Reverse Heaven** |
| 65 | Survival | the Order's last stand |
| 70 | Subjugation | the Chimera Matriarch (the inflection) |
| 75 | Domination | 4 waves |
| 80 | Conquest | Fragment Series + **Pryos Al Ragna** (shared by every account) |
| 85 | Conquest | the Fragment Colossus |
| 90 | Conquest | **the Herald of the End**; clearing it destroys the world |
| 95 | Survival | the Unfinished Floor collapses around you |
| 100 | Conquest | **Tell, the Architect**: the summit |

## 3. Event floors (Layer 2 §5.1)

`tower.event: TowerEvent | null`. While an event is open, the next floor stays shut until the
Master resolves it (`RESOLVE_EVENT { option }`).

- **Bonus** (scheduled): first clear of any anchor. Options: **Rest** (+40 Sanity to every
  living hero), **Treasure** (seeded gold + stones, scaled by floor), **Merchant** (pay gold for
  a bundle of stones at half the forge rate), **Gamble** (seeded 50/50: a large cache, or −20
  Sanity to the party).
- **Recovery** (dynamic): a battle that permadies ≥ 3 heroes (the main team). Options:
  **Reinforcement** (a free Normal summon), **Rest**.
- **Tournament** (scheduled): first clear of F41. Options: the five canon formats. Each
  one runs three non-lethal rounds against seeded rival parties of rising strength; the score
  sets the rank and the reward.

## 4. The loop (F36–40)

`tower.loop: { attemptsLeft: number; scars: number } | null` opens on entering F36. A failed
F40 → `currentFloor = 31`, `attemptsLeft − 1`. At 0: `scars + 1`, attempts refill to 5. Every
scar adds `loopScarLevels` to F36–40 enemies. Clearing F40 closes the loop.

## 5. Hidden objectives (Layer 2 §5.3)

`HIDDEN_OBJECTIVES`: a floor, a condition (`defeat` an optional target · `flawless`: no deaths
· `swift`: cleared within N ticks · `escortHp`: the NPC ends above X% HP), a reward and a lore
line. Found ones are stored in `tower.hiddenFound`. A hint is shown from Master Lv 10
(the half-Master's sight); before that the objective reads "???".

## 6. Data (schema v6 → v7)

```
TowerState += event: TowerEvent | null; loop: LoopState | null; hiddenFound: string[]; worldEnded: boolean
FloorResult += hiddenFound: string[]; event: TowerEvent | null; loopRollback: boolean
Command += { type: 'RESOLVE_EVENT'; option: string }
Objective += { kind: 'reach'; distance } | { kind: 'acquire'; targetTag }
```

## 7. Testing

Act pools and missions by band · F80–89 filler identical across accounts · each new anchor
builds · reach/acquire in combat · the F40 rollback, attempts and scars · events open on
anchor first-clears and on heavy losses, block the climb, and resolve · the tournament's
formats, ranks and rewards (non-lethal) · hidden objectives are found once and pay out ·
F90 sets `worldEnded`, F100 is the summit · migration v6→v7 · UI smoke tests for the event
window, the Chronicle and the 100-floor tower.
