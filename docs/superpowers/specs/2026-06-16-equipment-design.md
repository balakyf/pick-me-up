# Equipment (Layer 1 §5) — Vertical-Slice Spec

> **Status:** Design · **Date:** 2026-06-16 · **Owner layer:** Layer 1 §5.1–5.3
> **What this is:** the design contract for the Equipment vertical slice — the last
> unbuilt Layer 1 subsystem. It fixes the canon **grade ladder**, the **slot model**,
> the **flat derived-stat blocks** equipment writes into combat (Layer 0 §5.4), and a
> deterministic, Master-Level-gated **Smithy forge** as the in-slice acquisition loop.

## Stance & deferrals

Equipment in canon is "flat derived-stat blocks + tags that **never touch attributes**"
(§5.2). That seam already exists: `buildCombatUnit` (unit/) is the ONE place a hero
becomes a `CombatUnit`, and combat never recomputes stats. So equipment plugs in there.

**In scope (this slice):**
- **§5.1 Grade ladder** — `E < D < C < B < A < S` reachable in-slice (SS/SSS/U defined for completeness, unreachable until later balance).
- **§5.2 Slot model + stat blocks** — Weapon / Armor / Accessory, each granting a flat `Partial<DerivedStats>` block; the engine ALSO supports an optional weapon `element` override and optional `KeywordTag[]` (the §5.2 "element/keyword tags" capability).
- **§5.3 Smithy forge** — the Master crafts an item for a chosen slot, paying gold + Promotion Stones; the grade is the best the account's **Master Level** permits. **Deterministic, no RNG** (success-rate gambling is a Layer 3 concern, explicitly deferred by §5.3).

**Deferred (documented, not dropped):**
- **§5.4 Engravings/Imprints** — they ride a gacha 2%-summon roll and the keyword conditional-effect system; wiring them touches gacha. A follow-up slice.
- **§5.5 Book of Reverse Heaven** — 6★→7★, explicitly out-of-slice (the slice star ceiling is 6★).
- **Layer 3 ownership** — crafting *recipes*, *success rates*, *material sourcing*, and currency *amounts* remain Layer 3. This slice fixes only the **stat-per-grade ladder**, the **slot model**, and a no-gamble forge so the loop closes.

## 1. Data model

```
EquipmentGrade = 'E'|'D'|'C'|'B'|'A'|'S'|'SS'|'SSS'   (slice forges E…S)
EquipmentSlot  = 'weapon'|'armor'|'accessory'
EquipmentId    = string  (account-unique, e.g. 'eq_000007')

EquipmentItem {
  id: EquipmentId
  slot: EquipmentSlot
  grade: EquipmentGrade
  name: string                       // derived, e.g. "B Blade"
  statBonus: Partial<DerivedStats>   // flat block added to a hero's combat stats
  element?: Element                  // weapons may override the wielder's element (forge leaves undefined)
  keywords?: KeywordTag[]            // optional conditional-effect tags (forge leaves undefined)
}
```

Persisted state (schema **v2 → v3**):
- `GameState.inventory: EquipmentItem[]` — every item the account owns (equipped or not).
- `OwnedHero.equipment: { weapon, armor, accessory }` — each an `EquipmentId | null` referencing an inventory item.

An item is owned by at most one hero: equipping validates the item is not already
equipped elsewhere. Sacrificing/permadeath does NOT destroy gear — a dead hero's
slots are simply never read (gear can be unequipped via the engine, but the slice UI
only equips/unequips living heroes).

## 2. Grade ladder → stat blocks (§5.1, §5.2)

A single per-grade **magnitude** `m` anchors every slot, seeded by the canon weapon-ATK
ladder (§5.2: E +5 · D +12 · C +25 · B +45 · A +75 · S +120 · SS +190 · SSS +300):

| Slot | Grants (from magnitude `m`) |
|---|---|
| Weapon | `pAtk: m`, `mAtk: m` (helps any class; canon "+P.ATK/+M.ATK") |
| Armor | `maxHP: round(m × hpMult)`, `pDef: round(m × pDefMult)` |
| Accessory | `critPct: round(m × critMult)`, `spd: round(m × spdMult)` |

All multipliers live in `TUNING.lobby.equipment`. Outputs are rounded integers, so the
flat block adds cleanly onto the (already integer) derived stats.

## 3. Forge (§5.3) — the acquisition loop

`forgeGrade(masterLevel)` → the best grade unlocked by Master Level, via a tuning
threshold ladder (e.g. ML1→E, ML3→D, ML6→C, ML10→B, ML15→A, ML20→S). The Smithy itself
unlocks at `unlockMasterLevel`.

`forgeCost(grade)` → `{ gold, promotionStone }` rising with grade (Promotion Stones are
an existing material with a tower/daily/salvage faucet, so the loop is self-contained).

`craftEquipment(state, slot)` → validates the Smithy is unlocked and the account can
afford `forgeCost(forgeGrade(ml))`; deducts cost; appends a fresh `EquipmentItem` (grade =
`forgeGrade(ml)`, deterministic id = `eq_` + zero-padded `inventory.length + 1`) to the
inventory. PURE. No RNG.

## 4. Equip / unequip

- `equipItem(state, heroId, itemId)` — validate hero is alive, item exists, item's slot
  matches, item is not equipped on another hero; set `hero.equipment[slot] = itemId`
  (replacing whatever was there — the replaced item returns to free inventory).
- `unequipItem(state, heroId, slot)` — clear `hero.equipment[slot]` (no-op if already null).
- `equipmentBonus(hero, inventory)` → `{ stats: Partial<DerivedStats>; element?: Element; keywords: KeywordTag[] }`
  — sum the flat blocks of the hero's three equipped items, take the first equipped
  weapon's `element` as the override (if any), and concat all keywords. PURE.
- `equippedItemIds(state)` → a `Set<EquipmentId>` of every item referenced by any hero
  (UI lists only un-equipped items as forge-able-to-equip; equip-elsewhere is blocked).

## 5. Combat integration (the seam)

In `buildCombatUnit(hero, line, registry, inventory?)`:
1. derive hero stats, apply the Sanity penalty (unchanged — morale weakens the *hero*).
2. **add** the equipment flat block on top (gear is unaffected by morale).
3. if a weapon supplies an `element`, the unit's `element` (and thus its basic attack's
   element) becomes the weapon element.
4. append equipment keywords to the unit's `keywords`.
5. CP is recomputed from the final (post-gear) stats.

`inventory` is an optional param defaulting to `[]`, so every existing 3-arg call site
(tower, daily, tests) compiles unchanged and behaves identically — a hero with no gear
is byte-for-byte the same unit as before. The tower/daily call sites thread
`state.inventory` so deployed heroes fight with their gear.

## 6. Command surface

```
| { type: 'CRAFT_EQUIPMENT'; slot: EquipmentSlot }
| { type: 'EQUIP_ITEM'; heroId: HeroId; itemId: EquipmentId }
| { type: 'UNEQUIP_ITEM'; heroId: HeroId; slot: EquipmentSlot }
```

Wired into `reduce` after `SYNTHESIZE`. All three delegate to the pure module and throw
on a closed gate (same contract as promotion/synthesis).

## 7. UI — the Armory

A lobby panel (DailyPortal/SynthesisChamber pattern — a standalone access point, not a
`Room`): Master-Level-gated. Shows the next forge grade + cost and a "Forge {slot}"
control per slot; lists owned items; and per living hero, an equip/unequip control per
slot. Mirrors the synthesis panel's structure and styling tokens.

## 8. Testing

- **equipment.test.ts** — ladder/magnitude math, per-slot stat blocks, `forgeGrade`
  thresholds, `forgeCost`, craft (cost deduction + deterministic id + grade), equip
  (slot-match + single-owner guards), unequip, `equipmentBonus` summation + element
  override + keyword concat, gate throws.
- **unit.test.ts** — `buildCombatUnit` with an inventory: stats add on top of the
  Sanity-adjusted base; weapon element overrides; keywords append; no-inventory is
  unchanged.
- **account.test.ts** — fresh v3 defaults (`inventory: []`, hero `equipment` all null);
  v2→v3 migration.
- **store.test.ts** — CRAFT/EQUIP/UNEQUIP through `reduce`.
- **app.smoke.test.tsx** — the Armory renders, gated by Master Level.
- **determinism guard** — equipment uses only integer/lookup math; stays green.

## 9. Done-When

- typecheck clean; full suite green (492 prior + new); determinism guard green.
- Forge → equip → measurable combat-stat increase → unequip works end-to-end through `dispatch`.
- A geared hero's `buildCombatUnit` stats exceed an ungeared one's by exactly the block; an ungeared hero is unchanged from before the slice.
- No regression in any prior flow; the Armory renders gated in the lobby.
