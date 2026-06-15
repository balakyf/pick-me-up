# Pick Me Up! — Synthesis (Layer 1 §4) Design

> **Status:** Approved design (brainstorming output) · **Date:** 2026-06-15
> **Scope:** The **Synthesis** subsystem — Layer 1 §4. A vertical slice: a pure `synthesis/` engine module, a `SYNTHESIZE` command, and a closed-door **Synthesis Chamber** lobby room. Both canon modes (Transfer + Salvage).
> **Depends on:** the shipped engine — `promotion/` (re-roll/material/seed patterns this mirrors), `gacha/rollAttributes`, per-hero `sanity`, the `alive: false` permadeath convention, the v2 `materials` economy, and the lobby diorama.
> **Source of truth:** `2026-06-14-layer-1-hero-progression-design.md` §4 + `PICK-ME-UP-GAME-BIBLE.md`. **Stance:** playability-first; engine determinism inviolable.

Synthesis is the **second of the game's three permadeath paths** (canon: Tower death, Synthesis, PvP-kidnap). You drag heroes into the Synthesis Chamber; all but one are permanently destroyed. The system is deliberately **costly-but-viable, tuned toward salvage**: promotion is strictly better for *power*, so synthesis stays the right tool for *salvaging a doomed hero*, never the optimizer's pick. This honors the canon ">90% loss" and the protagonist's refusal-to-synthesize thesis without designing a useless trap.

---

## Decisions locked in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Modes in this slice | **Both** — Transfer + Salvage | the system reads complete; the "avoid synthesis" math is demonstrable |
| Morale cost model | **Survivor Sanity −15/sacrifice + witness Sanity hit** to other living heroes | Favorability is a Layer 3 system; Sanity exists and the tower already applies a witness-Sanity hit on ally permadeath — reuse that precedent |
| Salvage yield | **Existing promotion materials** (`promotionStone` + element `attrStone`), scaled by the sacrifice's star | Soul Stones' crafting sink is Layer 3; rendering straight into the existing promotion sink makes the salvage loop immediately useful with no new material |
| Chamber | **Plain closed-door room, Master-Level-gated, not upgradeable; synthesis resolves instantly (no timer)** | canon "Master can't watch — door stays shut"; keeps the slice tight; synthesis is a fixed-power tool |

---

## 1. Architecture

A new pure module **`src/engine/synthesis/synthesis.ts`**, shaped exactly like `promotion/`:

- **No new `GameState` fields.** Synthesis reuses what already exists: per-hero `sanity`, the `materials` map, the `alive: false` tombstone convention (heroes are never deleted), and the party `slots`.
- **One new command:** `SYNTHESIZE` (§4).
- **Determinism preserved.** Every random roll (transfer grade nudge, skill-copy chance, rescue pick) is seeded via `rngFor(accountSeed, 'synthesis', survivorId, sacrificeId)`. Because hero IDs are never reused (no-dupe gacha), each `(survivor, sacrifice)` pair is a unique, replayable RNG stream — an action never replays identically by accident, and an "offline"/replayed run reproduces the same result. The `__guards/determinism` test stays green (no `Date.now`/`Math.random`; multiplication/`ceil` only).

The module surface (mirrors `promotion.ts`):

```ts
export function canSynthesize(state, cmd): boolean          // gate, pure predicate
export function synthesisPreview(state, cmd): SynthesisPreview   // for the UI; no mutation
export function synthesize(state, cmd, nowWorld): GameState  // validate → apply → fresh state
```

`SynthesisPreview` is a plain data object the panel renders (per-attribute grade deltas, skill-copy odds, total material yield, total Sanity cost, the list of heroes that will die) — computed without RNG side effects where possible (odds shown as probabilities, not pre-rolled).

---

## 2. Command surface

```ts
| { type: 'SYNTHESIZE'
    mode: 'transfer' | 'salvage'
    /** Transfer: required. Salvage: optional rescue target (null = pure render). */
    survivorId: HeroId | null
    sacrificeIds: HeroId[] }
```

Threaded through `store.reduce` like the other commands (after `advanceTime`). The store edge passes `nowWorld`; synthesis itself has no timer but takes `nowWorld` for signature consistency and any future use.

---

## 3. Mode ① — Transfer (nudge the survivor)

**Inputs:** a living `survivorId` + one or more living `sacrificeIds` (none equal to the survivor).

**Effect (per sacrifice, applied in `sacrificeIds` order):**

1. **Grade transfer (upward-only, η-scaled).** For each of the five attributes:
   ```
   if sacrifice.growthGrades[attr] > survivor.growthGrades[attr]:
       survivor.growthGrades[attr] += ceil((sacrifice.grade − survivor.grade) × η)   # η = 0.10
   ```
   Deliberately tiny: a whole hero yields ~10% of one grade band, while **promotion re-rolls all grades upward for cheap stones at no Sanity cost**. Synthesis is therefore *strictly worse for power* — the intended "good Masters avoid it."
2. **Skill copy.** `skillCopyChance` (0.25) seeded chance to copy **one** skill the survivor lacks (drawn from the sacrifice's `skillIds` not already on the survivor). The spec's "lower chance for higher-grade skills" is **deferred** — `SkillEffect` has no grade field until the Skills-depth slice; noted here, flat chance for now.

**Costs:** `survivor.sanity −= survivorSanityCost (15)` per sacrifice; every *other* living hero takes `witnessSanityCost`. Sanity clamps at 0. No materials produced.

**Note on base attrs.** Transfer moves **growth grades only** (the canon "training scale"), not base attributes — faithful to spec §4.1, which transfers grade alone. Under Layer 0's formula `attribute(L) = base + grade × (L − 1) × G`, the grade is the *per-level growth slope* — it compounds with every level, so it's the higher-leverage long-term stat (exactly why promotion centers on grades). Promotion lifts **both** base and grade on a full upward re-roll; transfer, deliberately smaller, nudges only the grade — reinforcing "promotion dominates synthesis for power."

---

## 4. Mode ② — Salvage / Render (the reason it exists)

**Inputs:** one or more living `sacrificeIds`; `survivorId` optional (the rescue target).

**Effect:**

1. **Render to materials.** Each sacrifice yields promotion materials by its star, from a `salvageYield` table (first-pass, a **lossy fraction (~20–30%) of the cumulative Promotion Stones it cost to reach that star** — salvage, not a profit loop). Element `attrStone` matches the sacrifice's element. Yields fold into `state.materials`.
2. **Optional trait rescue.** If `survivorId` is set, rescue the sacrifice's single **best growth-grade** (its highest attribute, transferred whole and upward-only — not η-scaled) **OR** one signature skill the survivor lacks, onto the survivor before it permadies. Which of the two is rescued: prefer the skill if the survivor lacks one and the sacrifice has one; else the best grade. (Kept deterministic and simple; a player-chosen rescue toggle can come later.) Rescuing costs the survivor `survivorSanityCost` Sanity.

**Costs:** witness Sanity hit to other living heroes; survivor Sanity only if a rescue target was named.

---

## 5. Shared mechanics & guards

**On synthesis (both modes), atomically:**
- Every `sacrificeId` hero becomes `{ ...hero, alive: false }` (permadeath; tombstone retained, never deleted — matches tower death).
- Each sacrificed hero is nulled out of any party `slot` it occupied (slot → `null`, its `line` left as-is).
- Sanity costs applied and clamped to `[0, sanityMax]`.

**Guards (throw — same contract as `startPromotion`):**
- Synthesis Chamber must be unlocked: `state.meta.masterLevel >= unlockMasterLevel`.
- `sacrificeIds` non-empty; every sacrifice is a known, living hero, not mid-promotion (`promotion === null`), and `!== survivorId`.
- Transfer mode requires a living `survivorId` that is not itself a sacrifice.
- **At least one living hero must remain after** the synthesis (no roster wipe / soft-lock). The survivor counts; in pure salvage, the count excludes the sacrifices.
- Account must "afford" the action in the trivial sense (heroes exist) — there is no currency cost.

---

## 6. Tuning (`TUNING.lobby.synthesis` — all first-pass, tunable)

| Knob | First-pass | Governs |
|---|---|---|
| `transferEfficiency` (η) | `0.10` | grade transfer magnitude (canon ≈10%) |
| `skillCopyChance` | `0.25` | per-sacrifice chance to copy one missing skill |
| `survivorSanityCost` | `15` | Sanity drained from the survivor per sacrifice (and per rescue) |
| `witnessSanityCost` | `5` | Sanity hit to each *other* living hero (the "they witness it" morale cost) |
| `unlockMasterLevel` | `3` | Master Level that opens the Synthesis Chamber |
| `salvageYield` | star → `{ promotionStone, attrStone }`, a lossy ~20–30% of cumulative reach-cost; first-pass: 1–2★→`{1,0}`, 3★→`{6,3}`, 4★→`{14,7}`, 5★→`{30,15}`, 6★→`{62,31}` | render payout by sacrificed star |

Numbers are illustrative first-pass shapes; a balance pass owns the final values.

---

## 7. UI — the Synthesis Chamber

A new **closed-door room** in the lobby diorama (`src/ui/LobbyScreen.tsx`):

- Rendered with a **shut door** — no heroes are placed inside (canon: the Master can't watch). It joins the room set alongside Kitchen / Promotion Chamber / Tactical Center but is **not** a `FacilityId` (no upgrade control); it is a plain room gated on Master Level.
- **Locked state:** before `unlockMasterLevel`, the door shows "Unlocks at Master Lv N" (mirrors the Promotion Chamber's ML-gate copy).
- **Panel** (mirrors the Promotion Chamber panel's structure):
  - A **mode toggle**: Transfer / Salvage.
  - **Survivor** selector (required for Transfer; optional rescue target for Salvage).
  - **Sacrifice** multi-select from the living roster (excludes the survivor and mid-promotion heroes).
  - A live **preview** via `synthesisPreview`: per-attribute grade deltas (Transfer), skill-copy odds, total material yield (Salvage), total Sanity cost, and the explicit list of heroes that will die.
  - A **destructive-confirm** affordance: the confirm button reads "Permanently destroy N hero(es)" and requires an affirmation step (no accidental permadeath).

Reuse `bits.tsx` primitives and the existing panel/scene CSS; add only what the new controls need.

---

## 8. Testing

`src/engine/synthesis/synthesis.test.ts` (mirrors `promotion.test.ts`):

- **Transfer:** upward-only grade nudge math (η); never lowers a grade; `ceil` behavior; multi-sacrifice accumulation; seeded skill-copy (deterministic given seed; fires/doesn't at known seeds); survivor + witness Sanity costs; clamping at 0.
- **Salvage:** material yield by star (table-correct); element `attrStone` matches; optional rescue (best grade vs. skill selection rule, upward-only); witness Sanity cost; no survivor required.
- **Shared:** sacrifices become `alive: false`; party slots nulled; every guard throws (closed gate / empty sacrifices / unknown or dead sacrifice / mid-promotion sacrifice / survivor==sacrifice / last-living-hero protection).
- **Determinism:** the `__guards/determinism` test stays green; a replayed `SYNTHESIZE` reproduces identical results.

Plus: a store-level `SYNTHESIZE` test in `store.test.ts` (dispatch → persisted state) and a jsdom smoke test in `app.smoke.test.tsx` for the panel rendering + a happy-path salvage.

---

## 9. Done-When (acceptance)

- `npm run typecheck` clean; `npm test` all green, including the new synthesis/store/smoke tests and the determinism guard.
- Both modes work end-to-end through `dispatch({ type: 'SYNTHESIZE', … })`: Transfer nudges grades + maybe copies a skill at Sanity cost; Salvage renders to promotion materials with an optional trait rescue.
- Sacrifices are permadead (`alive: false`) and removed from the party; no path can wipe the last living hero.
- The Synthesis Chamber appears in the lobby, gated at Master Lv `unlockMasterLevel`, with a working preview and destructive-confirm panel.
- No regression: gacha, promotion, tower, and lobby flows are unchanged.

---

## 10. Deferred (noted, not built)

| Item | Why | Owner |
|---|---|---|
| Skill-grade-weighted copy odds ("lower for higher-grade skills") | `SkillEffect` has no grade field yet | Skills-depth slice |
| Literal Lesser Soul Stone material + Intermediate-Upgrade-Stone craft | crafting recipes are Layer 3 | Layer 3 |
| Favorability scale & roster morale effects | Favorability is a Layer 3 system | Layer 3 |
| 7★ high-η "absorption" (cap past 150) | 7★ is out of the current slice ceiling (6★) | post-Book-of-Reverse-Heaven |
| Player-chosen rescue (grade *or* skill) toggle | kept deterministic/simple for v1 | follow-up |
