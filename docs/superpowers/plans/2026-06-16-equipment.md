# Equipment (Layer 1 §5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the Equipment subsystem (§5.1–5.3) — a grade ladder, per-slot flat
derived-stat blocks, a deterministic ML-gated Smithy forge, equip/unequip, and combat
stat injection — as a pure engine module, three commands, and a lobby Armory panel.

**Architecture:** New pure module `src/engine/equipment/` mirroring `synthesis/`. New
persisted state (schema v2→v3): `GameState.inventory: EquipmentItem[]` and
`OwnedHero.equipment` slot refs. Combat plugs in at `buildCombatUnit` via a new optional
`inventory` param (back-compatible). No RNG anywhere — the determinism guard stays green.

**Tech Stack:** TypeScript (strict), Vitest, the `src/engine/<domain>/` module pattern,
`tuning.ts` for all constants, the `__guards/determinism` test, React + jsdom smoke tests.

---

## Task 1 — v3 schema (types + tuning + account/migration + fixtures)
**Files:** `types.ts`, `tuning.ts`, `account/account.ts`, `gacha/gacha.ts`; tests: `account/account.test.ts` + compiler-flagged fixtures.

- [ ] Add to `types.ts`: `EquipmentGrade`, `EquipmentSlot`, `EquipmentId`, `EquipmentItem`, `HeroEquipment`; `OwnedHero.equipment: HeroEquipment`; `GameState.inventory: EquipmentItem[]`; the three commands.
- [ ] Add `TUNING.lobby.equipment` block (unlock ML, grade magnitudes, slot multipliers, forge ML-thresholds, forge costs). Bump `TUNING.account.schemaVersion` to 3.
- [ ] `createAccount`: `inventory: []`; gacha builders set `equipment: { weapon: null, armor: null, accessory: null }`.
- [ ] `migrateV2toV3`: add `inventory: []` and per-hero empty `equipment`; chain it in `migrate`; add `inventory` to `assertGameStateShape` required keys.
- [ ] TDD: write fresh-v3-defaults + v2→v3 migration tests first (red), then make green. Fix compiler-flagged hero/state fixtures (add `equipment`/`inventory`).

## Task 2 — equipment engine module
**Files:** create `equipment/equipment.ts`, `equipment/index.ts`; test `equipment/equipment.test.ts`.

- [ ] TDD: write `equipment.test.ts` (ladder math, slot blocks, forgeGrade/forgeCost, craft, equip/unequip guards, equipmentBonus, gate throws) — red.
- [ ] Implement: `gradeMagnitude`, `statBlockFor(slot, grade)`, `forgeGrade(ml)`, `forgeCost(grade)`, `smithyUnlocked`, `craftEquipment`, `equipItem`, `unequipItem`, `equipmentBonus`, `equippedItemIds`, `itemName`. PURE, no RNG.
- [ ] Run determinism guard — green.

## Task 3 — commands through reduce
**Files:** `store/store.ts`; test `store/store.test.ts`.

- [ ] TDD: store tests for CRAFT/EQUIP/UNEQUIP — red.
- [ ] Import the module; add the three `reduce` cases after `SYNTHESIZE`. Green.

## Task 4 — combat integration
**Files:** `unit/unit.ts`, `tower/tower.ts`, `daily/daily.ts`; test `unit/unit.test.ts`.

- [ ] TDD: `buildCombatUnit` with inventory — stats add atop the Sanity-adjusted base; weapon element override; keyword append; empty inventory unchanged. Red.
- [ ] Add optional `inventory: EquipmentItem[] = []` param to `buildCombatUnit`; apply `equipmentBonus`. Thread `state.inventory` from the tower/daily unit-build call sites. Green; full suite green.

## Task 5 — Armory lobby panel
**Files:** `ui/LobbyScreen.tsx`, `ui/ui.css`; test `ui/app.smoke.test.tsx`.

- [ ] TDD: smoke test "Armory renders, gated by Master Level" — red.
- [ ] Add an `Armory` panel (synthesis-panel pattern): forge-per-slot with grade+cost, owned-item list, per-hero equip/unequip. Render after the Synthesis Chamber. Minimal styles reusing existing tokens. Green.

## Done-When
- typecheck clean; full suite green (492 prior + new); determinism guard green.
- Forge → equip → combat-stat increase → unequip works end-to-end; ungeared heroes unchanged; no prior-flow regression; Armory renders gated.
