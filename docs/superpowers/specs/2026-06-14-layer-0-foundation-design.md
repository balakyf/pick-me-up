# Pick Me Up! — Layer 0 Foundation Design

> **Status:** Approved design (brainstorming output) · **Date:** 2026-06-14
> **Scope:** The stat / combat / leveling foundation that every higher system depends on.
> **Source of truth:** `PICK-ME-UP-GAME-BIBLE.md` (research dossier).
> **Stance:** *Playability first* — canon flavor is preserved; canon math is balanced freely. Hard canon anchors (the 1–7★ ladder, per-star level caps, the Lv99 wall, no-duplicates, permadeath) are treated as inviolable constraints.

This is **Layer 0 of a 5-layer GDD**. It defines *what a stat is worth* so that every later layer (gacha rates, promotion costs, encounter tuning, economy) has a fixed unit to balance against. It deliberately does **not** design the systems above it — it defines the interface they plug into (see §5).

---

## 0. Layer Map (context)

| Layer | Contents | Status |
|---|---|---|
| **0 — Foundation** | stat model, combat engine, XP/leveling, CP, rarity bridge | **this doc** |
| 1 — Hero progression | gacha, promotion, synthesis, skills, equipment, party comp | future |
| 2 — Content & encounters | enemy tables, mission params, tower/win-state, event/looped/hidden floors | future |
| 3 — Meta & economy | currencies, lobby upgrades, daily dungeons, favorability, master leveling, minigames, intervention points | future |
| 4 — PvP & social | invasions, sector matchmaking, permadeath edge cases | future |

---

## 1. Stat Model

Three cleanly separated layers. This resolves **Open Question 3** (the two conflicting canon stat sheets): the raw numbers and the 0–10 scale are *different things*, not a contradiction.

### 1.1 Primary Attributes (the character sheet)

Five attributes, matching canon character snapshots (e.g. Han: Str 62 / Agi 57 / HP 58 / Int 10).

| Attr | Canon role | Primarily feeds |
|---|---|---|
| **STR** | Strength | Physical ATK, some physical DEF |
| **AGI** | Agility / Speed | SPD (turn order), Crit, Evasion, Accuracy |
| **VIT** | Vitality (canon "HP") | Max HP, physical DEF |
| **INT** | Intelligence | Magic ATK, Magic DEF |
| **WIL** | Willpower (canon **Mentality** attribute group) | Status/panic resistance, Magic DEF |

> Canon mapping note: the canon sheet's "HP" axis is modeled as **VIT** (the attribute); the unit's actual health bar is the derived **MaxHP** (§1.3).

### 1.2 Growth Grades (the canon 0–10 scale)

Each hero has a **grade per attribute** — the canon 0–10 training scale (Ridigeon "all 10/10"). The grade governs how fast that attribute climbs with level. This is the mechanical reason **same-rank heroes differ in power** (explicit canon).

Letter ↔ value mapping (for UI):

| Letter | F | E | D | C | B | A | S | SS |
|---|---|---|---|---|---|---|---|---|
| Value | 0–1 | 2 | 3 | 4 | 5–6 | 7–8 | 9 | 10 |

Per-level attribute formula:

```
attribute(L) = base_attr + growth_grade × (L − 1) × G        # G = 0.6 (global tuning constant)
```

- `base_attr` and `growth_grade` are rolled at summon within the star's envelope (§4).
- A hero with a high grade in an attribute scales that attribute far faster across its level band.

### 1.3 Derived Combat Stats (what the sim reads)

Recomputed every level (and whenever attributes/equipment change). Coefficients are **tuning knobs** — the *structure* is the contract, not the exact numbers.

```
MaxHP   = VIT × 12  + 50
P.ATK   = STR × 2.2 + AGI × 0.5
M.ATK   = INT × 2.4
P.DEF   = VIT × 0.8 + STR × 0.4
M.DEF   = WIL × 1.0 + INT × 0.6
SPD     = 40  + AGI × 0.6            # action-gauge fill rate
CRIT%   = 5   + AGI × 0.15           # capped at 60
EVA%    = AGI × 0.10                 # capped
ACC%    = 90  + AGI × 0.10
STATUS_RES = WIL × 0.20              # panic / abnormal-status resistance, capped
```

### 1.4 Non-combat tracked stats (kept out of the sim)

| Stat | Range | Owner layer | Notes |
|---|---|---|---|
| **Favorability** | 0–100 | Layer 3 | relationship/responsiveness; gifts raise/lower it |
| **Sanity / Morale** | 0–100 | Layer 1 | synthesis and harsh treatment drop it; affects obedience |

These never enter damage math; they gate behavior and unlocks in their owner layers.

---

## 2. Combat Resolution Engine

Round-based auto-battle sim. Parties of five vs. encounter rosters.

### 2.1 Turn order — Action Gauge (ATB)

Each tick, every living unit adds its `SPD` to a gauge. At **1000** the unit acts, then the gauge resets (overflow carries). Faster units act more often. No fixed rounds — scales cleanly to 5-vs-swarm.

### 2.2 Targeting (auto-battle)

Each class sets a default target priority:

| Class | Default target |
|---|---|
| Warrior / Spearman | front-most enemy |
| Archer / Mage | lowest-HP, else back-line |
| Thief / Rogue | highest-threat (highest CP) |

The Master may **focus** (force-prioritize) or **overlook** (deprioritize) a party member — canon, wired in Layer 3.

### 2.3 Damage formula

Multiplicative with diminishing-returns mitigation (so defense stays relevant across 100 levels without ever fully negating attacks):

```
raw     = ATK × skillMult × elementMult × critMult
mitig   = K / (K + DEF)                  # K = 50 + 8 × attackerLevel
variance= uniform(0.95, 1.05)
damage  = raw × mitig × variance
```

- `ATK`/`DEF` use the **physical** pair (P.ATK vs P.DEF) or **magic** pair (M.ATK vs M.DEF) per the skill's type.
- Variance is intentionally small (mostly deterministic, per the chosen round-based model) — just enough that identical rematches aren't carbon copies.

### 2.4 Crit

`critMult = 1.5` base (raisable by skills/engravings). Rolled per hit against the attacker's `CRIT%`.

### 2.5 Elements — 6-node wheel + Physical

```
Fire → Wind → Earth → Water → Fire        # advantage cycle
Light ⇄ Dark                              # mutual advantage
Physical                                  # neutral to all
```

`elementMult`: **1.5** on advantage, **0.75** on disadvantage, **1.0** otherwise. Maps onto canon: elemental promotion stones, Flame Resistance, water-dragon floors, and **Light = the "holy power"** used to break boss defenses.

### 2.6 Boss keyword mechanics (tags + strip-conditions)

Canon boss gimmicks become **data**, not bespoke code. A boss = statline + keyword list + the trigger that strips each keyword.

| Keyword | Effect | Canon example |
|---|---|---|
| `Immune(type)` | negates a damage type (Physical/Arrow/Magic) | F20 Black Dragon scales |
| `Vulnerable(element)` | strips immunities while active | Goddess' Blessing → holy weapons |
| `Phased` | core untargetable until an add/objective is cleared | F30 stone-statue crystal cores |
| `Enrage(timer)` | stat spike past a time limit | escort/survival floors |

New bosses = new data; no new combat rules. **Layer 2 plugs encounters in here.**

### 2.7 Death

A unit at 0 HP is removed from battle. Whether that death is **permanent** (Tower) or a **penalty** (sub-Lv40 PvP) is decided by an `encounterContext` flag the combat engine receives — *not* by combat itself. Keeps permadeath policy in Layers 2/4.

---

## 3. XP, Leveling & the 7★ Cap

### 3.1 Star caps (hard canon — inviolable)

| Star | Level cap | Band |
|---|---|---|
| 1★ | 10 | Mortal |
| 2★ | 20 | Mortal |
| 3★ | 40 | Mortal |
| 4★ | 60 | Mortal |
| 5★ | 80 | Mortal |
| 6★ | 99 | Mortal (system hard cap) |
| 7★ | **150** | Transcendent |

To level past a cap, a hero must **Promote** (Layer 1). XP earned at the cap is held; the hero shows the canon **"Lv.???"** state until promoted (flavor only).

### 3.2 Resolving Open Question 5 (7★ cap: 100+ / 351 / 658)

- The **Lv99 wall is real** for all mortal heroes (6★ and below).
- 7★ enters a **Transcendent band**, base cap **150** — the number the GDD balances around.
- Canon outliers (Lv351, Lv658) are **Book of Reverse Heaven absorption**: each hero a 7★ consumes raises its cap by a fixed amount. So 150 is the floor; the extreme numbers are endgame narrative we never balance normal play against. (Absorption math is a Layer 1 detail; Layer 0 only reserves the band.)

### 3.3 XP curve (super-linear, mirrors exponential tower difficulty)

```
xpToNext(L) = round( 25 × L^2.2 )        # exponent 2.2 is the master grind knob
```

| Level step | XP for step | Cumulative |
|---|---|---|
| 1 → 2 | 25 | 25 |
| 10 → 11 | ~3,960 | ~16k |
| 40 → 41 | ~78,000 | ~0.9M |
| 80 → 81 | ~360,000 | ~7.5M |
| 99 → 100 | ~590,000 | ~15M |

Low-star heroes cap in minutes (canon "disposable" 1★); a 6★ is a long investment.

### 3.4 XP sources & training

- **Sources:** floor clears (scaled to floor number), Daily Dungeons, plus a reduced share for benched party members (roster doesn't rot). Exact amounts = Layer 2/3; Layer 0 fixes only the curve.
- **Training ≠ leveling (canon):** training grants no XP and raises no attributes — it only unlocks/levels *skills* (Layer 1). The two progression axes never blur.

---

## 4. Combat Power & the Rarity↔Stat Bridge

### 4.1 Combat Power (CP)

One display/matchmaking number. **Never** a combat input — the §2 sim always decides fights. Defined here so no later layer invents its own "power."

```
CP = MaxHP×0.10 + P.ATK×1.0 + M.ATK×1.0 + P.DEF×0.6
   + M.DEF×0.6 + SPD×1.5 + (CRIT% × critMult)×2 + skillScore
```

`skillScore` = sum of a hero's skill power ratings (Layer 1). CP is recomputed on any stat/skill change, so it automatically respects level, grades, equipment, and promotion. Used for UI and sector matchmaking (Layer 4).

### 4.2 Rarity → Stat envelope

Star rank is **not a stat** — it sets the envelope the stat model rolls within. Each star fixes three things: level cap (§3.1), base-attribute floor, and growth-grade ceiling.

| Star | Base attr range | Growth-grade ceiling | Arrives with (canon) |
|---|---|---|---|
| 1★ | 1–8 | F–D (0–3) | nothing; no class |
| 2★ | 5–15 | E–C (1–4) | minimal kit |
| 3★ | 12–25 | D–B (2–6) | intermediate skills + dedicated gear |
| 4★ | 20–40 | C–A (3–8) | + exclusive weapon + **engraving** |
| 5★ | 35–60 | B–S (5–9) | + advanced skills + private weapon |
| 6★ | 55–80 | A–SS (7–10) | promotion-only |
| 7★ | 75–100+ | SS (10) | transcendent |

### 4.3 Two canon facts this produces for free

1. **"Same-rank heroes differ in combat power"** — grades roll within a band, so two 3★s diverge sharply by Lv40 (worked example §6.2).
2. **"A raised 1★ beats a rolled hero; Loki's 6★ party was raised, not rolled"** — **Promotion raises the cap and re-rolls grades *upward only*, never lowering a good roll.** A 1★ that rolled near its ceiling keeps elite grades all the way to 6★. Investment beats luck — the protagonist's thesis, encoded.

---

## 5. Anchors, Resolutions & the Layer-1 Interface

### 5.1 Canon anchors honored

1–7★ ladder · per-star caps (10/20/40/60/80/99/150) · Lv99 mortal hard cap · same-rank power variance · training ≠ leveling · five classes drive targeting + derived stats · Mentality group = WIL.

### 5.2 Open Questions resolved here

- **Q3 (two stat sheets):** raw numbers = **primary attributes**; 0–10 scale = **growth grades**. Two layers, not a contradiction.
- **Q5 (7★ cap):** base **150** (Transcendent band); higher numbers = Book-of-Reverse-Heaven absorption, never used to balance normal play.

### 5.3 Open Questions deferred (by design)

| Q | Topic | Owner |
|---|---|---|
| Q1 | tower length / floor-90 win-state | Layer 2 |
| Q4 | permadeath vs PvP-penalty boundary | Layer 4 (Layer 0 only exposes `encounterContext`) |
| Q6 | intervention points / probability interference | Layer 3 |

### 5.4 Layer-1 interface (the hooks)

| Layer-1 system | Reads from Layer 0 | Writes to Layer 0 quantities |
|---|---|---|
| **Gacha** | star envelope (§4.2) | rolls base attributes + growth grades |
| **Promotion** | current attrs/grades | raises level cap, lifts envelope, re-rolls grades upward only |
| **Synthesis** | both heroes' grades + skillScore | transfers grades/skills (lossy), drops Sanity/Morale |
| **Skills** | derived stats | adds skillScore to CP; supplies skillMult/element to §2 |
| **Equipment** | — | adds flat derived stats; grants element/keyword tags |
| **Party (5)** | SPD (order), class (targeting) | formation/synergy modifiers |

### 5.5 Global tuning knobs

The whole foundation flexes from ~6 numbers: growth constant `G = 0.6` · XP exponent `2.2` · defense constant `K = 50 + 8×lvl` · element advantage `1.5 / 0.75` · base `critMult = 1.5` · CP weight vector.

---

## 6. Worked Examples (sanity check)

### 6.1 Han at Lv29 (canon sheet → derived stats)

Canon primary attributes: STR 62, AGI 57, VIT 58 (canon "HP"), INT 10, WIL ≈ 30 (not in canon snapshot; assigned).

```
MaxHP = 58×12 + 50          = 746
P.ATK = 62×2.2 + 57×0.5     = 165   (136.4 + 28.5)
M.ATK = 10×2.4              = 24
P.DEF = 58×0.8 + 62×0.4     = 71    (46.4 + 24.8)
M.DEF = 30×1.0 + 10×0.6     = 36
SPD   = 40 + 57×0.6         = 74
CRIT% = 5 + 57×0.15         = 14%
```

Reads as a sane physical Warrior: high HP/ATK/DEF, near-zero magic — consistent with canon "Int 10" and Warrior class.

**Sample hit** (Han basic-attacks a Lv29 goblin, DEF 30, neutral element, no crit):
```
K     = 50 + 8×29 = 282
mitig = 282 / (282+30) = 0.904
dmg   = 165 × 1.0 × 1.0 × 1.0 × 0.904 × ~1.0 ≈ 149
```
A ~120-HP goblin dies in one–two hits — appropriate for a tutorial-band Warrior.

### 6.2 Same-rank variance (two 3★ Warriors at Lv40, base_STR 18)

```
High roll (STR grade S=9):  STR(40) = 18 + 9×39×0.6 = 18 + 210.6 = 229  → P.ATK ≈ 504
Low roll  (STR grade D=3):  STR(40) = 18 + 3×39×0.6 = 18 + 70.2  = 88   → P.ATK ≈ 194
```
Both are "3★ Lv40," yet the high-grade roll hits ~2.6× harder — exactly the canon claim that same-rank heroes vary, and the reason a well-rolled, raised hero is worth promoting.

---

## 7. Tuning Constants Appendix

| Constant | Value | Governs |
|---|---|---|
| `G` (growth) | 0.6 | attribute gain per level per grade-point |
| XP exponent | 2.2 | grind length / cost ramp |
| XP base | 25 | absolute XP scale |
| `K` (defense) | 50 + 8×lvl | defense diminishing-returns midpoint |
| Element advantage | 1.5 | advantaged-element damage multiplier |
| Element disadvantage | 0.75 | disadvantaged-element damage multiplier |
| `critMult` base | 1.5 | crit damage multiplier |
| Crit cap | 60% | max CRIT% |
| Variance | ±5% | per-hit damage wobble |
| CP weights | see §4.1 | display/matchmaking power |

All derived-stat coefficients in §1.3 are likewise tunable; the formula *shapes* are the contract.
