# Pick Me Up! — Visual Lobby (Waiting Room) Design

> **Status:** Approved design (brainstorming output) · **Date:** 2026-06-15
> **Scope:** A playable vertical slice of the **Lobby / waiting room** — the visual home base and the front-end of Layer 3 (Meta & Economy), plus the Layer 1 **Promotion** system it surfaces.
> **Depends on:** Layer 0 (stats/combat/CP), Layer 1 (promotion, party), Layer 2 (tower rewards, daily-dungeon content hook), Layer 3 (meta-economy design). Implemented on top of "Slice 1" (the playable F1–10 gacha-tower loop).
> **Source of truth:** `PICK-ME-UP-GAME-BIBLE.md` + the five-layer GDD. **Stance:** playability-first; hard canon anchors inviolable; engine determinism inviolable.

The lobby is a place you **watch**, not a menu: heroes live in rooms, and where a hero stands reflects what they're doing and how they feel. This spec turns that into a concrete, testable build on the existing pure/deterministic engine.

---

## Decisions locked in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Presentation | **Single-screen diorama** (layout A) | every room visible; simplest to navigate/build; can grow floors later without a rewrite |
| Hero liveliness | **Ambient life** (level 2) | state-driven placement + cosmetic CSS motion; zero game state rides on it, so determinism/saves stay clean |
| Scope | **Vertical slice** (B): 3 facilities | proves the concept and delivers a real meta-loop within one plan |
| Facilities | **Kitchen (Sanity), Promotion Chamber, Tactical Center**, on a **Master-Level** spine | one emotional-state loop, one major progression payoff, one cheap combat lever — none require the unbuilt equipment/synthesis systems |
| Time model | **Full real-time meta (C), determinism-preserved** | real timers / offline progress / daily resets, with the wall clock as an *input at the edge* so the engine stays pure |
| Material faucet | **Tower drops *and* Daily Dungeons** | tower trickles, Daily Dungeons target by weekday (canon primary source) |

**Out of this slice (designed elsewhere, deferred):** equipment & engravings, synthesis, Hall of Magic / Probability Interference, the Dimensional Gate / PvP, the gacha Advanced (gem) pool, autonomous-hero activity simulation (liveliness 3), multi-floor rank-stratified layout, and login-streak/FOMO compulsion systems.

---

## 1. Time architecture — real-time meta without breaking determinism

**Principle: the clock is an input, not a side effect.** The engine already does this with randomness (`freshSeed()` grabs entropy only at the UI edge). We do the same with time: the UI reads the wall clock and passes it in; **no engine module ever calls `Date.now()`**, so the determinism guard stays green and any run replays identically given the same `now` inputs.

- **World-time dilation:** real elapsed ms → world-time at the canon **3×** (1 Earth day = 3 world days). One constant in `tuning.ts`. All internal timers run on world-time.
- **`advanceTime(state, nowWorld, seed) → state`** — a *pure* catch-up function run on load and before each command. It fast-forwards elapsed world-time: completes any facility build or promotion whose `completesAtWorld` has passed, regenerates Sanity, resets the Daily-Dungeon attempt counter on a world-day boundary, and bumps `lastSeenAtWorld`. Deterministic in `(state, elapsed, seed)`.
- **"Offline" = state catch-up only** (timers finishing, Sanity regen) — **not** heroes autonomously roaming (that's the deferred liveliness-3). Ambient wandering stays purely cosmetic.
- **Gem-skip** (canon pay-to-skip): spend gems to set a timer's `completesAtWorld = now`.

---

## 2. State model & command surface

**New `GameState` fields (schema v1 → v2):**
```
gems: number                              // premium currency (gold already top-level)
materials: Record<MaterialId, number>     // promotionStone, attrStone_<element>, rankMaterial…
meta: {
  masterLevel: number
  masterXp: number
  lastSeenAtWorld: number                 // world-time of last advanceTime
}
facilities: Record<FacilityId, {          // 'kitchen' | 'promotionChamber' | 'tacticalCenter'
  level: number
  build: { toLevel: number; completesAtWorld: number } | null
}>
dailies: { attemptsUsed: number; lastResetWorldDay: number }
```

**Per-`OwnedHero` additions:**
```
sanity: number                            // 0–100
promotion: { completesAtWorld: number } | null   // in-progress promotion timer
```

**Clock at the edge → `reduce` gains an argument:** `reduce(state, cmd)` becomes `reduce(state, cmd, nowWorld)`. The **store** is the single clock-reader: on each dispatch it reads `Date.now()`, converts to world-time, runs `advanceTime`, then applies the command. Command payloads stay clean; tests pass an explicit `nowWorld`.

**New `Command` variants:**
```
| { type: 'UPGRADE_FACILITY'; facility: FacilityId }      // pay gold+materials, start build
| { type: 'PROMOTE_HERO'; heroId: HeroId }                // gated; pay materials, start timer
| { type: 'SKIP_TIMER'; kind: 'facility' | 'promotion'; id: string }   // gem pay-to-skip
| { type: 'ATTEMPT_DAILY' }                               // seeded daily-dungeon combat
| { type: 'TICK' }                                        // pure catch-up (load / focus / interval)
```

**New engine modules** (following the existing `src/engine/<domain>/` pattern; each pure + its own `*.test.ts`):
- `time/` — world-time conversion + `advanceTime`
- `facilities/` — facility defs, upgrade cost/duration, Master-Level curve & XP, gating
- `promotion/` — gate → cost → timer → on-complete writes
- `daily/` — weekday rotation, reward tables, attempt/reset rules
- Sanity is cross-cutting (no standalone module): **drain** in `tower`, **regen** in `time`, **penalty** read in `combat`.

**Migration v1→v2** (in `account.migrate`, currently an empty chain): add the fields with safe defaults — `gems: 0`, `materials: {}`, every hero `sanity: 100` / `promotion: null`, `meta` seeded from `createdAt`, `dailies` zeroed, all `build: null`. Facilities start with **Kitchen and Tactical Center at `level 1`** (built) and the **Promotion Chamber at `level 0`** — `level 0` means *locked / not yet built*; it becomes buildable at Master Lv 3 (§3.1). Bump `schemaVersion` to 2.

---

## 3. Systems

### 3.1 Master Level (the spine)
Separate track from hero levels. `masterXpToNext(L) = round(60 × L^1.8)`, cap 100. XP from: floor clears, first-clears, completed promotions, facility upgrades. Gates facility upgrade ceilings and unlocks the Promotion Chamber at a low level (first-pass ML3). Later hangs ML10/20/30 (Advanced summon, PvP, sub-master) — out of slice.

### 3.2 Kitchen + Sanity/Morale
Per-hero Sanity, 0–100, starts full.
- **Drain:** each floor attempt costs `base + k × (floorPower / partyCP)`; a wipe adds extra, and **witnessing an ally's permadeath** adds a larger hit (canon "bad for morale").
- **Regen:** passive over world-time in `advanceTime`, rate scaled by Kitchen level; plus an interactive **Banquet** (Kitchen click-action): spend gold → immediate roster-wide Sanity bump.
- **Effect (read in `combat`):** ≥60 none · 30–59 minor stat penalty (~−5%) · <30 penalty (~−15%) + **panic risk** (a lost turn, probability `(30 − sanity)%` mitigated by `statusRes`) · 0 = breakdown, cannot deploy until recovered. All thresholds are tuning knobs.
- **Kitchen level:** faster regen, stronger banquets, lifts a "won't drop below" Sanity floor.

### 3.3 Promotion Chamber + Promotion
The "raise, don't roll" engine (Layer 1 §3). High value here because the Normal-pool gacha only yields 1–3★, so promotion is the main path upward.
- **Gate:** hero at its star's level cap (`xp.atCap`). The canon skill-level threshold is **deferred** (skills are thin in the slice) — noted for later tightening.
- **Cost:** Promotion Stones + element-matched Attribute Stones on the canon doubling curve (1→2: 10/2 · 2→3: 20/4 · 3→4: 40/8 · 4→5: 80/16 · 5→6: 160/32). World-time timer scaling with target star, reduced by chamber level, gem-skippable.
- **On complete (deterministic, seeded):** (1) raise level cap to new star; (2) lift the stat envelope to the new band (`STAR_ENVELOPES`); (3) **re-roll growth grades upward-only**, keeping `max(old, new)` per attribute; (4) grant a promotion skill. **Slice ceiling 6★** (6★→7★ needs the Book of Reverse Heaven — out of slice).

### 3.4 Tactical Center + focus / overlook
The `FocusDirective` already flows into combat (Slice 1), so the Tactical Center **amplifies** an existing lever rather than gating it — no regression to current behavior.
- **Starts built (level 1).** Baseline **focus** (mark a target so heroes concentrate on it) works as it does today.
- **Level:** **focus** gains a concentrate-fire damage bonus on the marked enemy (~+6%/level); **overlook** (steer enemy targeting off a chosen ally) gains strength and more slots (1 at L1, +1 every 2 levels). The strength factor is passed into the `Encounter`; `combat` reads it.

### 3.5 Daily Dungeons (material faucet)
A rotating combat encounter accessed from a **portal** in the scene (an access point, not a leveled facility). Reuses the seeded combat sim, enemy templates, and mission primitives.
- **3 free attempts per world-day**, reset at the world-day boundary via `advanceTime`; extra attempts cost gems.
- **Weekday rotation** (canon flavor kept; loot right-sized to the slice): Mon **Gold Vault** → gold · Tue **Elemental Trial** → Attribute Stones (element rotates) · Wed **Promotion Grounds** → Promotion Stones + rank materials · Thu **Proving Hall** → hero XP · Fri **Soulforge** / Sat **Armory** → slice-substitute reward (gems / materials bundle) until upgrade/equipment systems exist · Sun **Convergence** → reduced-rate mix.
- **Gating:** master level + tower progress (light). **Seed:** `rngFor(accountSeed, 'daily', dayIndex, attemptIndex)` — fully deterministic.

### 3.6 Material & gem economy (faucets → sinks)
| Faucet | Yields | Sink |
|---|---|---|
| Tower floor clears | gold, hero XP, **occasional stones** | Normal summons, facility upgrades, Banquets |
| Daily Dungeons | **targeted materials**, gold, hero XP, some gems | Promotions, upgrades |
| First-clears, Master-Level-ups | gems (thin drip) + small starter grant | gem-skip, daily refill |

Balance target (consistent with the GDD): steady-but-slow F2P progression; gems compress *time* (skips/refills), never unlock unique power.

---

## 4. The scene & rendering

- **A new `lobby` tab** in `App.tsx` (a fifth tab; the natural landing screen). Same `View` union + `TABS` wiring.
- **The scene is a read-only projection of `GameState`.** A pure helper `heroLocation(hero, state) → roomId` decides placement: `dead → Storage`, `promotion ≠ null → Promotion Chamber`, `sanity < threshold → Kitchen`, deployed → a "ready" marker, else → `Square`. Recomputed every render; no positional state persisted.
- **Ambient motion is cosmetic CSS only** (idle bob/drift), carrying zero game state.
- **Click a room → a panel** (drawer) with that room's actions: Kitchen (Sanity bars + Banquet + upgrade), Promotion Chamber (promote / skip), Tactical Center (upgrade + current focus strength), Daily Dungeon (enter today's run). Panels **reuse existing components** (`HeroCard`, `Portrait`, `Bar`, `.btn` styles) and `ui.css` tokens — **no new art assets**.
- **Topbar gains** Master Level + XP bar, gems, and a materials count, beside the existing gold/heroes/floor pills.
- **Live countdowns:** a small UI interval re-reads world-time to tick the *displayed* timers (cosmetic); *actual* completion is computed by `advanceTime` on the next dispatch / `TICK` / load.

---

## 5. Build order & testing

Six dependency-ordered phases, each shippable and tested; all numbers land in `tuning.ts`; the determinism guard stays green throughout.

1. **Spine (invisible).** v2 state + v1→v2 migration; `time/` (dilation + `advanceTime`); `reduce(state, cmd, nowWorld)` + store-as-clock-reader + `TICK`. *Tests:* migration round-trip, `advanceTime` determinism with injected `now`, guard confirms no `Date.now` in the engine.
2. **Scene shell + Master Level (first visible).** `lobby` tab + diorama + `heroLocation` placement + ambient CSS + topbar; Master-Level XP/curve + upgrade gating. Panels read-only for now. *jsdom smoke test.*
3. **Kitchen + Sanity.** Drain (`tower`), regen (`advanceTime`), penalty/panic (`combat`); Kitchen upgrade + Banquet; Kitchen panel.
4. **Promotion + material faucet.** `promotion/` (gate→cost→timer→on-complete upward-only re-roll + cap raise + skill); `PROMOTE_HERO` + gem `SKIP_TIMER`; tower material drops; Promotion Chamber panel. *Tests include the seeded upward-only re-roll.*
5. **Daily Dungeons.** Weekday rotation; `ATTEMPT_DAILY` (seeded combat); attempt counter + world-day reset; reward tables + gem refill; portal panel.
6. **Tactical Center + polish.** Tactical Center → focus-strength into combat; live countdown interval; gem-skip surfaced everywhere; first-pass tuning flagged for a balance pass; the integration loop test extended to cover lobby↔tower (Sanity drained over a climb, a promotion completing "offline").

**Testing discipline:** a `*.test.ts` per new module (matching the existing pattern); all time-based logic tested by injecting fixed `now`; the `__guards/determinism` test keeps asserting the engine is `Date.now`/`Math.random`-free (the UI store is the sole clock source, alongside `freshSeed`); UI smoke tests via jsdom; the `__integration/loop` test extended end-to-end.

---

## 6. Existing modules touched

| Module | Change |
|---|---|
| `types.ts` | new GameState/OwnedHero fields, new `Command` variants, `FacilityId`/`MaterialId` |
| `tuning.ts` | new knobs (§7) |
| `store/` | `reduce(…, nowWorld)`; clock read + `advanceTime` on dispatch; new command cases |
| `account/` | v1→v2 migration; starter grants (gems, sanity defaults) |
| `tower/` | Sanity drain on floor result; occasional material drops |
| `combat/` | low-Sanity penalty/panic; focus-strength factor from Tactical Center |
| `ui/` | new `lobby` tab + scene + panels; topbar additions; reuse `bits.tsx` |

---

## 7. Tuning constants (first-pass register — all tunable)

| Knob | First-pass | Governs |
|---|---|---|
| `worldTimeFactor` | 3 | real→world-time dilation |
| sanity drain base / `k` / wipe / ally-death | 6 / scaling / +10 / +15 | Sanity pressure |
| sanity regen / world-hr | 2 × kitchenFactor | recovery pace |
| sanity penalty thresholds | 60 / 30 / 0 | combat penalty + panic + breakdown |
| banquet cost / restore | 800 gold / +25 | Kitchen action |
| `masterXpToNext` | `round(60 × L^1.8)`, cap 100 | master pacing |
| promotion stone curve | 10/20/40/80/160 (+attr ½) | promotion sink |
| promotion timer (by target star) | ~10 world-min (→2★) … ~6 world-hr (→6★) | promotion pacing |
| tactical focus bonus / overlook slots | +6%/lvl / 1+⌊lvl/2⌋ | combat lever |
| daily free attempts / gem refill | 3 / ~30 gems | faucet throttle |
| gem drip (first-clear / ML-up / starter) | 10–50 / 20 / ~100 | premium economy |

---

## 8. Open canon notes folded in

- "Lobby levels up; more unlocks via probability interference" → Master-Level + (future) PI gating of facilities/rooms.
- "Heroes live in the waiting room with free will" → state-driven placement + ambient life (cosmetic in slice; autonomous sim deferred).
- "Synthesis Chamber, Master can't watch" → Promotion Chamber door stays shut in the scene.
- "Daily Dungeons by day of week, rare mats on elites" → §3.5 rotation + drop rates.
- "Time dilation 1 Earth day = 3 world days" → `worldTimeFactor`, the spine of all timers/offline progress.
- "Compulsion / whale layer" → gem-skip + daily gem-refill are the in-slice toehold; the fuller predatory layer is deferred.
