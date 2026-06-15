# Pick Me Up! — Layer 2: Content & Encounters Design

> **Status:** Approved design (brainstorming output) · **Date:** 2026-06-15
> **Scope:** The tower, its floors, enemies, missions, and special-floor systems — the content engine the party climbs through.
> **Depends on:** Layer 0 (combat sim, statlines, keywords, CP, permadeath flag) and Layer 1 (party comp, Book-of-Reverse-Heaven drops).
> **Source of truth:** `PICK-ME-UP-GAME-BIBLE.md`. **Stance:** playability-first; hard canon anchors inviolable.

Layer 2 turns the stat/progression machinery below it into *places to fight*. It fixes tower **structure, generation, scaling, and mission rules**; it defers all **reward amounts** (Gold/Gems/XP/materials per floor) to Layer 3 and all **PvP matchmaking** to Layer 4.

---

## Design decisions locked in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Win-state (Open Q1) | **Full 100 floors**; F90 world-destruction = narrative twist/boss-arc, not a hard stop; F100 = true summit | maximizes climbable content; keeps the canon twist as a climax beat |
| Floor content (Open Q2) | **Hybrid** — authored anchors every 5th floor (shared) + per-account seeded filler between | reconciles "fixed wiki logs" with "every world differs" |
| Failure loop | **Position persists, heroes don't** — wipe retries the same floor; permadeath of the fallen; loop-segments are the rollback exception | matches persistent-account + permadeath canon; throttle is roster, not energy |

---

## 1. Tower Structure & Win-State

100 floors, each a **stage**; clearing one advances one (canon). Floor is a **persistent per-account position** (never reset to 1).

### 1.1 Anchor cadence (hybrid backbone)

| Floor type | Cadence | Content |
|---|---|---|
| **Anchor** | every 5th (5,10,15…) | authored set-piece: named boss / signature mission, shared across accounts |
| **Filler** | the 4 between anchors | per-account seeded (§2) |

### 1.2 Difficulty curve (exponential, +step every 5 — canon)

```
floorPower(f) = BASE × (1.06)^f × stepBonus(f) × worldMult
stepBonus(f)  = 1 + 0.15 × floor(f / 5)
```
Past F70 the exponent ramps (inflection). All coefficients are tuning knobs.

### 1.3 Difficulty landmarks (canon)

| Floor | Event |
|---|---|
| every 5th | difficulty spike |
| **70** | inflection — curve steepens |
| **80** | **The Wall / "Wailing Wall"** — **Fragment Series** spawns for *all* accounts (overrides seed); only ranks 1–5 pass |
| **90** | **world-destruction twist** — major boss-arc + narrative gate (climax, not a stop) |
| **100** | **summit** — final boss (Tell-tier) = the true win |

### 1.4 Enemy level scaling (feeds Layer 0 statlines)

```
mobLevel(f)  = round(f × 1.25 × worldMult)        # F80 ≈ Lv100 ≈ the 6★ cap
bossLevel(f) = mobLevel(f) × bossMult(1.5–2.5)    # late-80s bosses ≈ Lv250 (canon); 7★ ≈ Lv350, a tier above
```

### 1.5 World difficulty grade (canon C–S), set once at account creation

| Grade | worldMult | Canon example |
|---|---|---|
| C | 1.0 | normal account |
| B | 1.8 | — |
| A | 2.6 | — |
| S | 3.5–4.0 | Niflheim ~3.5, Taonier ~4.0 |

One multiplier scales every encounter on the account.

---

## 2. The Hybrid Content Generator

**Determinism:** `accountSeed` set at creation; any floor's content = `hash(accountSeed, floor)`. Stable on retry (position persists), different across accounts (every world differs).

### 2.1 Acts / biome bands (default spine, seeded from canon Townia)

| Floors | Biome / act | Enemy pool (canon) | Anchor boss |
|---|---|---|---|
| 1–9 | Prairie | goblins, wolves, harpies | F5 survival, F10 Lv999 wave |
| 11–19 | Ruins/City | skeletons, soldiers, mages | F15 escort/guard, F20 Halgiraf |
| 21–30 | Swamp | lizardmen, golems | F25 escape, F30 stone-statue golem |
| 31–39 | Aquatic | sharks, mermen, kraken | F35 water-dragon Kthat |
| 41–69 | War/Order | armies, dark knights | named Order bosses |
| 70–79 | Inflection | elite mixed | steep ramp |
| 80–89 | **The Wall** | **Fragment Series (shared)** | F80 world-boss |
| 90–99 | Endgame | apex | F90 destruction twist |
| 100 | Summit | — | final boss |

Filler inherits the act's theme so procedural floors stay coherent with their authored bosses.

### 2.2 Filler floor generation (from seed)

```
1. biome      ← act band of floor f
2. mission    ← mission table (§4), weighted by floor band
3. roster     ← sample biome enemy pool
4. count/waves← FILL until Σ enemyPower ≈ floorPower(f) ± 10%   # difficulty guarantee
5. map + NPCs ← layout, escort/defend targets if needed
```
**Step 4 is the safeguard:** the power budget is met regardless of the random roster, so variety never breaks the curve — the "procedural can't guarantee difficulty" risk, neutralized.

### 2.3 Anchor floors (authored + light variance)

Every 5th floor loads a hand-designed encounter (boss statline + Layer 0 keyword bundle + scripted mission). The seed perturbs only minor details (why wikis show the same F20 dragon but a slightly different F15 across accounts). Anchors = shared canon; trim = per-account.

### 2.4 F80 override

At the Wall, the **Fragment Series** template replaces the per-account seed for everyone — a globally identical brutal wall, the universal ranker filter.

---

## 3. Enemy & Encounter Scaling

An enemy **is a Layer 0 unit** (derived statline + skills + keyword tags); the sim treats heroes and enemies identically.

### 3.1 Enemy templates (archetypes)

| Template | Profile | Element | Keywords |
|---|---|---|---|
| Goblin/swarm | low everything, high count | Physical | — |
| Skeleton | low HP, numerous | Dark | — |
| Ogre/brute | high HP+STR tank | Physical | — |
| Mage/caster | high M.ATK, low DEF | elemental | — |
| Beast/rider | high SPD | Physical | — |
| Boss (dragon/golem) | huge budget | themed | `Immune(...)`, `Phased`, `Enrage` |
| Fragment Series | apex (F80) | Dark/void | stacked immunities |

### 3.2 Stat derivation (direct, no attribute rolls)

```
enemyStat  = templateMult[stat] × statCurve(level)      # same curve family as heroes
enemyPower = CP(enemy)                                  # reuse Layer 0 §4.1
```
Reusing **CP as the power unit** makes the generator's budget (§2.2 step 4) calibrated against real hero strength.

### 3.3 Bosses

`bossLevel = mobLevel × 1.5–2.5`; statline × **bossMult (×5–20)** (raid HP sponge) + keyword bundle + optional **multi-phase** (ordered statline list — canon F30). Late-80s bosses ≈ Lv250 (canon); 7★ heroes (~Lv350) a tier above.

### 3.4 Waves & scripted spikes

- Missions may stage enemies in **waves** (canon F10 = 3 waves); clearing one spawns the next; bosses anchor the final wave.
- **Scripted overwhelming spikes** (canon F10 "Lv999 creature") are *puzzle* enemies, not stat-checks: a boss with `Enrage`/`Phased` whose real solution is the floor's mission objective, not raw DPS.

### 3.5 Biome → element coupling

Biomes theme enemy elements (aquatic→Water, undead→Dark, demon→Dark) → plugs into the Layer 0 element wheel; makes canon **Light/"holy power"** the natural counter on dragon and Wall bosses.

---

## 4. Mission System

The ~20 canon mission types collapse into **one schema from 8 objective primitives** (closes Gap 9).

### 4.1 Schema

```
Mission {
  type            : <canon name>
  objectives      : [Primitive...]          # chained for "Complex"
  timer           : seconds | turns | null
  failConditions  : [party_wipe, npc_death, timer_expired, objective_lost]
  successThreshold: e.g. survive 30min | 100% enemies | item delivered
  modifiers       : [waves, escort_target, hidden_objective(§5), loop(§5)]
}
```

### 4.2 Eight primitives

`Annihilate` · `Survive(t)` · `Reach/Escape(zone)` · `Protect(npc[,t])` · `Acquire(item)` · `Deliver(item→npc)` · `Defeat(boss)` · `Defend(location,waves)`.

### 4.3 Canon types → composition (defaults from canon floor logs)

| Canon type | Primitive(s) | Default params |
|---|---|---|
| Tutorial | Annihilate (scripted) | tutorial goblins |
| Subjugation | Annihilate / Defeat(boss) | F11 skeletons, F20 dragon |
| Conquest | Defeat(boss) + clear | F80 world-boss |
| Survival | Survive(t) | **F5: 30 min** |
| Explore/Exploration | Reach(zone) [+Annihilate] | F30 |
| Defend | Defend(location, waves) | **F10: 3 waves**, last = Lv999 |
| Guard | Protect(npc) + Reach | F15 (Guard variant) |
| Escape | Reach(exit) under pressure | F25 |
| Defense-and-Escape | Protect(npc) + Reach(exit) | F25 |
| Seizure / Capture | Acquire(item) past guardian | F31–35 |
| Escort | Protect(npc) + Reach, timer | **F15: 15 min** |
| Delivery | Deliver(item→npc) | F45 |
| Chase | Defeat(fleeing) + timer | F41 |
| Domination | Defend/clear all zones | — |
| Bonus | optional Explore/loot | between-floor breather |
| Complex | multiple chained objectives | **F50: Protect(object)+Defeat(Egg)** |
| Looped | objective + `loop` modifier | F36–40 (§5) |
| Tournament | bracket event | (§5) |

### 4.4 Generator weighting

Each floor band biases the mission table (early = Subjugation/Survival; mid = Escort/Seizure; late = Conquest/Complex), so procedural floors feel like their act.

---

## 5. Special Floor Systems & the Failure Loop

### 5.1 Event floors (recovery breathers)

Triggers: *scheduled* Bonus floor after each anchor boss; *dynamic* recovery event after a wipe that cost the main team (canon).

| Event | Effect |
|---|---|
| Rest | restore SP / Sanity / Morale |
| Merchant | spend Gold/Gems (Layer 3 shop) |
| Reinforcement | free material / recruit token |
| Treasure | loot cache |
| Choice | narrative branch + reward/risk |

### 5.2 Looped missions — the one exception to persistent position (canon F36–40)

```
LoopSegment { start: 36, gate: 40, maxAttempts: 5 }
fail at gate → position rolls back to start (F31), attempts−−
attempts = 0 → forced/harsher reset
```
Dead heroes still stay dead. Everywhere else position persists; loop segments are authored rollback zones.

### 5.3 Hidden objectives (canon, tied to world-destruction)

```
HiddenObjective { trigger: explore|condition, reward: rare loot|lore, loreFlag: foreshadows F90 }
```
Revealed by exploration/condition; protagonist's half-Master sight can pre-reveal. Higher chance on anchors; some seed the F90 twist (canon F34 "Hunt of the Water God").

### 5.4 Tournament events (canon F41/42)

PvP-format event floors; formats here, **matchmaking deferred to Layer 4**: Battle Royale, Party Raid, Team Game, Pair Game, Deathmatch — ranking-scored for Gold/Gem/material rewards.

### 5.5 Failure & permadeath loop

```
attempt floor → deploy ≤5 (or ≤3 parties on raid anchors)
hero at 0 HP in tower → encounterContext = TOWER → PERMANENT death (Layer 0 §2.7)
party wipe → floor FAILED:
    • position unchanged (retry same seeded floor) — except inside a LoopSegment
    • dead heroes stay dead; retry with survivors + other roster
    • main team lost → unlock recovery event floor
```
No stamina gate — the throttle is your **roster**. Losing irreplaceable heroes *is* the cost, as the permadeath fiction intends.

---

## 6. Interface (what Layer 2 reads & writes)

| Direction | With | Detail |
|---|---|---|
| Reads | Layer 0 | combat sim, statline/CP derivation, keyword system, permadeath flag |
| Reads | Layer 1 | party composition (≤5, ≤3 parties), engraving/element counters |
| Writes | Layer 1 | Book of Reverse Heaven drops from raid bosses (6★→7★ trigger) |
| Writes (deferred) | Layer 3 | per-floor reward *amounts* (XP/Gold/Gems/materials), shop on Merchant floors, Daily Dungeon content |
| Writes (deferred) | Layer 4 | Tournament/PvP-format matchmaking; Fragment-series "invasion"-style content |

### Deferred out of Layer 2

| Item | Owner |
|---|---|
| Reward amounts per floor/mission | Layer 3 |
| Merchant/shop inventory & prices | Layer 3 |
| Daily Dungeon weekly schedule | Layer 3 |
| Tournament matchmaking & PvP resolution | Layer 4 |
| Account-deletion / 6-month inactivity, win/lose edge cases | Layer 4 |

---

## 7. Worked Example — generating filler floor F7 (C-grade world)

```
worldMult = 1.0 (C);  f = 7  (filler, Prairie act)
floorPower(7) = BASE × 1.06^7 × (1 + 0.15×1) × 1.0 ≈ BASE × 1.50 × 1.15 ≈ 1.73·BASE
mobLevel(7)   = round(7 × 1.25 × 1.0) = 9

1. biome   → Prairie
2. mission → band-weighted → "Subjugation" (Annihilate)
3. roster  → goblins (+ a goblin raider, canon F8-adjacent)
4. fill    → add Lv9 goblins until Σ CP ≈ 1.73·BASE  → ~6 goblins + 1 raider
5. map     → open prairie, no escort NPC
```
Result: a Lv9 Subjugation skirmish, ~7 enemies, calibrated to the curve — coherent with the authored F5 (survival) and F10 (defend) anchors around it. A party of well-leveled 1–2★ heroes clears it; a wipe leaves you on F7 to retry.

---

## 8. Open canon notes folded in

- "100 floors but world ends at 90" → full 100 floors with F90 as a climax twist, F100 the true summit (§1).
- "Differs per account" vs fixed wiki logs → hybrid generator (§2): authored anchors shared, filler seeded.
- "Difficulty spikes every 5 floors / F70 inflection / F80 wall" → §1.2–1.3.
- "F80 Fragment Series for all accounts" → seed override (§2.4).
- "Failing F40 drops to F31" → LoopSegment (§5.2), the sole rollback exception.
- "Tower death is permanent" → encounterContext = TOWER (§5.5), Layer 0 §2.7.
- "Event floors help recovery" → §5.1 dynamic recovery events.
