# Autopilot Recap — Equipment & Engravings (Layer 1 §5) vertical slice

**Task:** "look in the docs and `docs/superpowers/specs` to understand the project and check what has been done and continue implementing."

**Status:** IN PROGRESS (living draft)

## Definition of Done
- Identify the next unbuilt subsystem and implement it as a complete vertical slice (engine + command + UI), matching the repo's TDD + module conventions.
- `npm run typecheck` clean; `npm test` all green (492 prior + new tests); determinism guard stays green.
- No regression in gacha, promotion, synthesis, tower, daily, lobby flows.
- Spec + plan docs authored under `docs/superpowers/`, mirroring prior slices.

## What was already done (discovered)
- Layers 0–4 GDD specs complete. Engine + UI built through: stats, combat, gacha, promotion, synthesis, tower, daily, facilities, master, kitchen, tactical, account, content, time, store. 492 tests pass, typecheck clean (on `main`).
- Layer 1 subsystems built: gacha, skills, promotion, synthesis, party. **Equipment (§5) was the remaining Layer 1 gap.**

## This slice: Equipment (Layer 1 §5.1–5.3)
A new `equipment/` engine module: grade ladder (E…S reachable), per-slot flat derived-stat blocks, a deterministic ML-gated Smithy forge (craft), equip/unequip, and combat stat injection at `buildCombatUnit`. Schema v2→v3 (new `inventory` on GameState, `equipment` on OwnedHero).

## Assumptions recorded (resolved without asking)
1. **Equipment is the next slice** — last unbuilt Layer 1 subsystem; integrates cleanly at the `buildCombatUnit` seam.
2. **Scope = §5.1–5.3 (Equipment proper).** Deferred: §5.4 Engravings (depends on a gacha 2%-summon roll + keyword conditional-effects — touching gacha risks regressions) and §5.5 Book of Reverse Heaven (explicitly 7★, out-of-slice). Documented for a follow-up slice.
3. **Forge is deterministic, Master-Level-gated** (no new Smithy *facility* plumbing; no RNG). Faithful to §5.3 which defers crafting *recipes & success rates* to Layer 3 — so the slice fixes only the stat-per-grade ladder + slot model + a no-gamble forge. Keeps the determinism guard green.
4. **Crafted items are elementless / keyword-free**; the engine still fully *supports* weapon element-override + keyword tags (the §5.2 capability), exercised by unit tests with hand-built items. Keeps the combat element path and the UI simple while proving the capability.
5. **New persisted fields are required** (not optional), with a v2→v3 migration — matching the codebase's strict-shape convention (mirrors the v1→v2 work).

## Staged / outward-facing actions
- Work is on branch `slice-3-equipment` (branched from clean `main`). Commits are local only — NOT pushed (no explicit push instruction). To integrate: `git checkout main && git merge slice-3-equipment` then push if desired.

## Progress log
- (start) Surveyed docs, specs, src; ran baseline (492 green / typecheck clean). Chose Equipment slice. Branch + recap created.
