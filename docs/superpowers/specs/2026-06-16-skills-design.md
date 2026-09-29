# Skills (Layer 1 §2) — Vertical-Slice Spec

> **Status:** Design · **Date:** 2026-06-16 · **Owner layer:** Layer 1 §2.1–2.5
> **What this is:** the design contract for the Skills vertical slice — the largest
> remaining Layer 1 subsystem. It turns today's **static** per-hero skill list into a
> living progression: skills carry a **grade + level**, **auto-learn** by being cast in
> combat, scale their multiplier with level, fuel **HP-cost ultimates** and **merge
> recipes**, and feed Combat Power. No new player command — progression is automatic.

## Stance & deferrals

Skills already have a combat seam: `buildCombatUnit` (unit/) resolves a hero's `skillIds`
against the authored `SKILLS` registry into the `SkillEffect[]` the sim greedily picks
from. This slice keeps that seam but makes the resolved effect **level-dependent**, and
adds the post-combat bookkeeping (XP, merges) alongside the XP/permadeath fold the tower
already runs. Determinism is preserved: combat still resolves once into a frozen
snapshot; all leveling/merging happens in the **pure post-combat fold**, never mid-sim.

**In scope (this slice):**
- **§2.1/§2.2 anatomy** — every skill has a `grade` (`F<E<D<C<B<A<S<U`) and a `level` (1…grade cap). Grade sets the max level and the multiplier ceiling.
- **§2.3 costs + HP-cost ultimates** — keep SP costs; add optional `hpCost`. The canon "consumes vitality" ultimates (Ixid, Pathology) spend current HP when cast.
- **§2.4 auto-learn** — each owned skill gains use-XP every time the sim fires it; skills level themselves up to the grade cap. Fully automatic.
- **§2.4 merge recipes** — a seeded recipe table; when a hero holds both inputs at sufficient level, the merge **auto-resolves** (inputs consumed → result at level 1).
- **§2.5 CP feed** — `skillScore = Σ(gradeValue × level)` adds a weighted term to a unit's CP.
- **Read-only UI** — the Roster lists each hero's skills as `name · grade · Lv N`.

**Deferred (documented, not dropped):**
- **Training Center** — the Master's lever to *bias which* skills develop (§2.4). The auto-learn engine ships now; the steering UI/command is a follow-up.
- **Conditional new-skill unlocks** — canon Lv11/Lv15/Lv29 situational unlocks (§2.2) need a condition system; out of slice.
- **Achievement & promotion-granted skills** — new-skill *acquisition* sources (§2.1, §3.3). Heroes keep their innate kit; the slice grows and merges what they already hold. Promotion stays untouched.
- **Transfer-Station crafted merges** — the manual merge path; this slice does only the auto-resolve path.

## 1. Data model (schema v3 → v4)

```
SkillGrade = 'F'|'E'|'D'|'C'|'B'|'A'|'S'|'U'

SkillDef {                 // authored registry entry (static)
  id, name
  grade: SkillGrade
  damageType, element, target          // unchanged combat fields
  spCost: number
  hpCost?: number                      // HP-cost ultimate (omitted = none)
  baseMult: number                     // skillMult at level 1
  perLevel: number                     // skillMult added per level above 1
}

HeroSkill { id: string; level: number; xp: number }   // per-hero instance
```

- `OwnedHero.skills: HeroSkill[]` **replaces** `OwnedHero.skillIds: string[]`.
- The static `Hero` / `HeroTemplate` keep `skillIds: string[]` (innate authoring). Minting
  an `OwnedHero` maps each id → `{ id, level: 1, xp: 0 }`.
- Migration **v3 → v4**: every persisted `OwnedHero.skillIds` → `skills` at level 1, xp 0;
  drop `skillIds`. Chained into `migrate`; `skills` added to `assertGameStateShape`.

## 2. Grade & leveling (§2.1, §2.2)

All constants first-pass in **`TUNING.skills`**:
- `maxLevel[grade]` — the level cap per grade (e.g. F…D cap at 4, C…A at 5, S/U at 6).
- `gradeValue[grade]` — the CP weight per grade (F lowest … U highest).
- `xpToNext(level)` — use-XP needed to advance from `level` (a small frozen integer curve).
- `cpPerSkillScore` — CP per unit of `skillScore`.

`skillMultAt(def, level) = def.baseMult + def.perLevel × (level − 1)`, with `level` clamped to
`maxLevel[def.grade]`. The per-cast `SkillEffect` the sim reads gains `hpCost?: number` and
carries the resolved (leveled) `skillMult`.

## 3. Skills module (`src/engine/skills/`, pure)

Mirrors `equipment/` / `synthesis/`. No RNG.
- `skillDef(id)` / registry access; `skillMultAt(def, level)`; `maxLevelFor(grade)`.
- `resolveSkillEffect(heroSkill) → SkillEffect` — leveled effect for combat (incl. `hpCost`).
- `awardSkillXp(skills, casts) → HeroSkill[]` — add use-XP per cast; carry level-ups up to
  the grade cap (excess XP rolls into the next level; capped skills bank no XP).
- `resolveMerges(skills) → HeroSkill[]` — table lookup; for each recipe whose **both** inputs
  are held at ≥ its `minLevel`, remove the inputs and add the result at level 1. Deterministic
  order; a freshly-merged result can't chain again the same pass.
- `skillScore(skills) → number` — `Σ gradeValue[grade(id)] × level`.

**Merge table (§2.4, first-pass; results include the HP-cost ultimates):**

| Inputs (≥ minLevel) | Result | Notes |
|---|---|---|
| Berserk + Composure | Exceed | ordinary buff-class result |
| Berserk + Calmness | **Ixid** | Unique; `hpCost` ultimate |
| Sword Soul + Ganggyeok | **Pathology** | Unique; `hpCost` ultimate |
| Basic Swordsmanship + Basic Shield | Sword-Shield Technique | — |

Content adds these canon `SkillDef`s and seeds a couple of cameo heroes with recipe inputs
so a merge is reachable in normal play (first-pass authoring).

## 4. Combat integration (skill selection, HP-cost ultimates, cast tally)

**⚠ Discovered constraint — a must-fix prerequisite.** Today `chooseSkill` returns the
*first* skill in the unit's array whose `spCost` is affordable, and `buildCombatUnit`
prepends the spCost-0 basic attack as `skills[0]` — so in real play **heroes only ever
basic-attack; their authored skills never fire.** (It is invisible today because combat
unit-*tests* construct units without the prepended basic.) A skills slice is inert unless
authored/leveled skills actually fire, so the slice corrects selection:

- `chooseSkill` picks the **highest resolved-`skillMult` castable** skill, where castable =
  `currentSP ≥ spCost` **and** `currentHP > hpCost` (strict — the auto-battler never literally
  suicides); ties break by array order. The basic attack (mult 1, spCost 0, no `hpCost`) is the
  floor, chosen only when no authored skill is castable.
- On cast, spend `spCost` **and** `hpCost`. HP-cost ultimates self-damage; the canon "can
  self-kill at max" survives as a property — at max level `hpCost` can exceed survivable HP, so
  the skill gates itself off rather than killing its wielder.
- The result reports a **cast tally** `Map<heroId, Map<skillId, count>>` keyed by `sourceHeroId`.
  Enemies (no `sourceHeroId`) and the synthesized basic are not tallied.

`buildCombatUnit` resolves `hero.skills` → `[basicAttack, ...leveled SkillEffects]` and adds
`round(skillScore(hero.skills) × cpPerSkillScore)` to the unit's `cp`. With authored
`baseMult` set to each skill's old `skillMult`, `skillMultAt(def, 1) === def.baseMult`, so a
level-1 cast hits for its pre-slice number.

**Test impact (expected, not a regression).** The determinism *guard* (no Math.random/Date.now)
stays green, and every "replay twice → identical" assertion stays green (selection is still
deterministic). But because heroes now cast real skills instead of basic-attacking, **golden
outcome assertions** in combat/tower/daily/integration tests shift and are **re-baselined** as
part of this slice.

## 5. Auto-learn + merge fold (tower + daily)

After the existing post-combat bookkeeping (XP, permadeath, rewards), for each surviving
deployed hero, in order: **(a)** `skills = awardSkillXp(skills, tally[heroId])`, then **(b)**
`skills = resolveMerges(skills)`. Both pure, deterministic, no RNG. Wired identically in
`tower.playFloor` and `daily.attemptDaily` from the same combat-result tally.

## 6. Command surface

**None new.** Unlike equipment/synthesis, skills carry no player command this slice —
auto-learn and auto-merge both happen inside the pure post-combat fold. (The deferred
Training Center is where a future `TRAIN_SKILL`/merge command will live.)

## 7. UI — read-only skill display

The Roster's hero view gains a compact skill list: each `HeroSkill` rendered as
`name · grade · Lv N` (e.g. "Power Strike · C · Lv 3"), reusing existing roster/chip tokens.
No actions, no new panel.

## 8. Testing (TDD)

- **skills.test.ts** — `skillMultAt` scaling + grade-cap clamp; `xpToNext`/`awardSkillXp`
  level-ups and cap banking; `resolveMerges` (fires at minLevel, consumes inputs, result at
  Lv1, no double-chain, no-op when ineligible); `skillScore`; `resolveSkillEffect` carries
  leveled mult + `hpCost`.
- **combat.test.ts** — an HP-cost ultimate is chosen when castable and spends HP; it is gated
  off when `currentHP ≤ hpCost`; SP gating unchanged; the cast tally counts hero casts and
  excludes basic/enemies.
- **unit.test.ts** — `buildCombatUnit` resolves leveled effects; `skillScore` raises CP; an
  all-Lv1 hero's skill damage equals the pre-slice baseline.
- **tower.test.ts / daily.test.ts** — a run awards skill-XP (a skill levels) and a seeded
  hero's inputs auto-merge after combat.
- **account.test.ts** — fresh v4 defaults (`skills` from innate ids at Lv1); v3 → v4 migration.
- **app.smoke.test.tsx** — the Roster shows a hero's skill with its grade + level.
- **re-baseline** — combat/tower/daily/integration golden-outcome assertions updated for the
  selection change (heroes now cast authored skills); "replay twice → identical" tests untouched.
- **determinism guard** — skills use only integer/lookup math; stays green.

## 9. Done-When

- typecheck clean; full suite green (529 prior + new); determinism guard green.
- A skill cast in a tower run gains XP and, at threshold, levels up; its `skillMult` rises.
- A hero seeded with both recipe inputs auto-merges them into the result after a run.
- An HP-cost ultimate fires and spends HP when castable, and is gated off (never lethal) when it can't be paid.
- `skillScore` adds the CP term; an all-Lv1, unmerged hero is otherwise damage-identical to the pre-slice baseline.
- Heroes now cast their authored/leveled skills in real combat (previously basic-only); affected golden tests are re-baselined and the determinism guard stays green.
- No regression in any prior *flow* (clears still clear, wipes still wipe); the Roster renders each hero's skills (name · grade · level).

## 10. Implementation notes (as built, 2026-09-29)

Decisions taken while building the slice, where the spec left room or needed a fix:

- **AoE scoring.** "Highest resolved `skillMult`" alone would never pick an all-enemies skill
  whose mult is below the basic attack's 1.0 (Thunder Volley is 0.9). Selection scores a skill as
  `skillMult × foes it would hit` (1 for single-target), ties by array order.
- **HP-cost scaling.** Ultimates carry `hpCost` + `hpCostPerLevel`, so the canon "can kill at
  max" survives as a *self-gating* property: at high level the cost outgrows the wielder's HP
  and the skill simply stops being castable. Casts emit a new `hp-cost` combat event.
- **Registry shape.** `SKILLS` now holds `SkillDef`s (`grade`, `baseMult`, `perLevel`,
  `hpCost?`, `learnable`); `baseMult` of the original five equals their old `skillMult`.
  `learnable: false` keeps promotion drawing from the original five in the same order, so its
  seeded draws are unchanged.
- **Canon kit.** Islat Han's cameo now carries Power Strike + Berserk + Composure, making the
  canon Exceed merge reachable from the starter.
- **Transfers arrive fresh.** Synthesis transfer/rescue and promotion grants add the skill at Lv1.
- **Results.** `FloorResult` / `DailyResult` carry `skillProgress` (level-ups, merges) for the
  results screen; daily survivors auto-learn win or lose (the run is non-lethal).
- **Re-baselining.** Only fixtures (`skillIds` → `skills`), CP expectations (+skill term) and the
  registry shape needed updating; tower/daily/integration golden outcomes held.
