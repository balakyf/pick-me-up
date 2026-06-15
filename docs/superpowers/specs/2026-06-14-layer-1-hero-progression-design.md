# Pick Me Up! — Layer 1: Hero Progression Design

> **Status:** Approved design (brainstorming output) · **Date:** 2026-06-14
> **Scope:** All six hero-progression subsystems in one spec — Gacha, Skills, Promotion, Synthesis, Equipment & Engravings, Party Composition.
> **Depends on:** `2026-06-14-layer-0-foundation-design.md` (plugs into its §5.4 interface).
> **Source of truth:** `PICK-ME-UP-GAME-BIBLE.md`. **Stance:** playability-first; hard canon anchors inviolable.

Layer 1 is everything that **acquires, grows, equips, and arranges heroes**. It reads the Layer 0 stat envelope and writes back attributes, growth grades, skills, and flat stats. It defers all *material sourcing / costs in currency* to Layer 3 and all *encounter gating* to Layer 2 — it fixes **structure and quantities**, not where loot comes from.

---

## Design decisions locked in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Pity model (no-dupe twist) | **Rising Quality Floor** | every pull is a unique person, so pity raises *quality*, not copies — canon "bond raises quality" |
| Synthesis positioning | **Costly-but-viable, tuned toward salvage** | math makes "raise > synthesize" for power; synthesis stays the right tool for utility/salvage. Honors the >90%-loss canon and the protagonist's thesis without designing a useless trap |

---

## 1. Mobius Summon (Gacha)

### 1.1 Pools (hard canon)

| Pool | Currency | Star range | Per-pull (1st-pass) |
|---|---|---|---|
| Normal / Free | Gold | 1★–3★ | 3,000 Gold |
| Advanced / Paid | Gems | 3★–5★ | 150 Gems (10-pull = 1,350) |

5★ is the gacha ceiling (canon). 6★/7★ never roll — promotion-only.

### 1.2 Base rates (per-account ±variance applies — canon "odds differ per account")

| | 1★ | 2★ | 3★ | 4★ | 5★ |
|---|---|---|---|---|---|
| Normal | 70% | 25% | 5% | — | — |
| Advanced | — | — | 80% | 18% | 2% |

### 1.3 Rising Quality Floor (the no-dupe pity)

Every pull without a 4★+ increments `pity`. It raises the **minimum** roll, resets on payout, and can be pre-loaded by bond/favor (canon "bond increases quality").

| Pool | Threshold → guarantee |
|---|---|
| Advanced | `pity 30` → 4★+; `pity 90` → 5★ |
| Normal | `pity 50` → 3★ |

### 1.4 No duplicates, enforced

Each account has a per-account-seeded hero space; summons **sample without replacement**. A drawn hero ID is never re-issued on that account → "infinite, all unique" is literally true.

### 1.5 Roll algorithm (the gacha → Layer 0 §4.2 bridge)

```
1. roll star          (rate table §1.2, raised by pity floor §1.3)
2. roll class         (Mage = gacha-only, very low chance; 1★/2★ → no class)
3. per attribute:     roll base_attr + growth_grade within the star envelope (§4.2)
4. attach starting    skills + gear per star tier (§4.2 "arrives with")
5. if star ≥ 4:       roll engraving (2% per §5)
6. mark hero ID consumed for this account
```

### 1.6 Whale-bait inflation (canon, optional toggle, default OFF)

`displayStar` may exceed `trueStar` to bait spending (canon: Sirris shown 4★, truly ~1★). A flag, surfaced as a late-game "the goddess lies" reveal — not a balance lever.

### 1.7 Cadet recruitment (non-gacha channel)

Canon Niflheim path (Lv20+, 3★+, gem fee, training period, acceptance odds). Flagged here; **specified in Layer 3** (economy).

---

## 2. Skills

Heroes **auto-battle and auto-learn** (canon). The Master shapes *what* they learn, never micromanages casts.

### 2.1 Taxonomy

| Type | Source | Behavior |
|---|---|---|
| Innate | arrive-with by star (§4.2) | high-star heroes start with kit |
| Trained | Training Center | learned/refined over time (canon list) |
| Promotion | granted on rank-up (§3) | new skill(s) each promotion |
| Achievement | combat feats | e.g. Dragon Slayer; **cannot be trained** |
| Merged | recipe (§2.4) | two skills fuse into a stronger one |

### 2.2 Skill anatomy

- **Level 1–6** (canon). Auto-levels from *use* (skill-XP per cast). New skills unlock on **level/floor/situation** conditions (canon: Throwing Defense = Lv11 skill, Siman = Lv15, Incident = Lv29).
- **Grade** `F < E < D < C < B < A < S < U(Unique)` (canon B, B+, Unique). Grade sets max level and base-multiplier ceiling.
- **Effect block** read by the sim: `skillMult`, damage type (phys/magic), `element`, target pattern, cost.

### 2.3 Costs & the canon "vitality" skills

Combat resource **Stamina (SP)**: `MaxSP = 100 + WIL×2`, regens each turn. Active skills cost SP and/or have cooldowns. The canon "consumes vitality, can kill at max" skills (Ixid, Pathology) are **HP-cost ultimates** — they spend current HP; at max power they can self-kill. Desperate, high-risk tools exactly as canon describes.

### 2.4 Auto-learn & merging

- **Auto-learn:** each owned skill gains use-XP when the sim fires it; heroes level skills themselves. The Master's only lever is **Training** (bias *which* skills develop — refines skills, never stats/level, per canon).
- **Merge recipe table** (seeded with canon, extensible). When a hero holds both inputs at sufficient level, the merge unlocks (auto-resolves in combat, or crafted at the Transfer Station):

| Inputs | Result | Canon |
|---|---|---|
| Berserk + Composure | Exceed | Lv1 |
| Berserk + Calmness | Ixid | B+, Unique, status immunity; HP-cost, can self-kill |
| Sword Soul + Ganggyeok | Pathology | B, Unique, fixed-damage; self-damage to death |
| Basic Swordsmanship + Basic Shield | Sword-Shield Technique | Lv3–10 → Intermediate Sword |

### 2.5 Feeds Layer 0

`skillScore = Σ(gradeValue × level)` → CP (§4.1). `skillMult`/`element` → damage formula (§2.3 of Layer 0).

---

## 3. Promotion (Rank-Up)

The "raise, don't roll" engine. Done in the **Promotion Chamber** (Master can't watch — canon).

### 3.1 Gate (both required)

1. Hero at its current star's **level cap** (Layer 0 §3.1).
2. Hero has **≥1 skill at a threshold level** (canon "rank up after reaching a certain skill level"); threshold rises per rank.

### 3.2 Cost curve (canon anchors 2★=10, 3★=20; extended ~×2/rank)

| Promotion | Promotion Stones | Attribute Stones (element-matched) | Gate item |
|---|---|---|---|
| 1★→2★ | 10 | 2 | — |
| 2★→3★ | 20 | 4 | Intermediate Upgrade Stone* |
| 3★→4★ | 40 | 8 | — |
| 4★→5★ | 80 | 16 | — |
| 5★→6★ | 160 | 32 | — |
| 6★→7★ | — | — | **Book of Reverse Heaven** (canon; Layer-2 raid drop) |

*Intermediate Upgrade Stone = Lesser Upgrade Stone + Lesser Soul Stone (canon). Material *sourcing* = Layer 3; Promotion fixes only *quantities*.

### 3.3 On promotion — the §5.4 write to Layer 0, in order

1. **Raise level cap** to new star (§3.1).
2. **Lift envelope** — base-attr floor + growth-grade ceiling rise to the new band (§4.2).
3. **Re-roll growth grades upward-only** — re-roll within the new band; keep `max(old, new)` per attribute. *This is the §4.3 engine: a well-rolled 1★ stays elite to 6★; investment beats luck; synthesis stays unnecessary for power.*
4. **Grant new Promotion skill(s)** (§2).
5. (Flavor) restore a memory fragment — the protagonist's promotion-gated arc.

### 3.4 6★→7★ is special

No stone path. Requires the **Book of Reverse Heaven** (or killing a 7★) — unique, narrative-gated (Layer 2). Keeps 7★ as rare as canon; supplies the trigger for the "absorption raises cap past 150" mechanic (Layer 0 §3.2).

---

## 4. Synthesis (Compounding)

**Costly-but-viable, tuned toward salvage.** Synthesis Chamber; drag 2+ heroes; all but one are **permanently destroyed** (canon permadeath path #2).

### 4.1 Mode ① — Transfer (nudge the survivor)

```
η = transfer efficiency  (0.10 base — canon "≈10%";  0.25+ for a 7★ survivor)

grade transfer (per attribute):
   if sacrifice.grade > survivor.grade:
       survivor.grade += ceil((sacrifice.grade − survivor.grade) × η)   # upward-only, tiny

skill transfer:
   25% chance to copy ONE sacrifice skill to survivor (lower for higher-grade skills)

cost:
   survivor.Sanity     −= 15 per sacrifice     # canon "loss of humanity/sanity"
   roster Favorability −= 5                     # others witness — canon "bad for morale"
```

Because a whole hero yields ~10% of one grade band while **Promotion re-rolls grades upward for cheap stones at no morale cost**, synthesis is **strictly worse for power** — the intended "good Masters avoid it." Never the optimizer's pick.

### 4.2 Mode ② — Salvage / Render (the reason it exists)

```
destroy a doomed/weak hero →  Lesser Soul Stones (crafting, feeds Promotion §3)
   + optionally rescue its single best grade OR one signature skill before permadeath
```

The humane use: a hero about to die anyway yields its best trait instead of losing all. (The protagonist refuses even this — his stand still reads.)

### 4.3 7★ tie-in

A 7★ survivor's high `η` **is** the canon "absorption" engine — each compounded hero raises its cap past 150 (Layer 0 §3.2). Tell's 7★s "absorbing heroes indefinitely" = high-efficiency synthesis. One system, two scales.

---

## 5. Equipment & Engravings

### 5.1 Grade ladder (canon)

`E < D < C < B < A < S < SS < SSS(초신급/5신기) < U(Unknown)`. SS can be "Legendary." Grade sets bonus magnitude.

### 5.2 Equipment = flat derived-stat blocks + tags (writes Layer 0 §5.4; never touches attributes)

| Slot | Grants |
|---|---|
| Weapon | `+P.ATK`/`+M.ATK`, an `element`, sometimes a skill or keyword tag |
| Armor | `+MaxHP`, `+P.DEF` |
| Accessory | mixed `+stats`, special effects |

First-pass weapon-ATK ladder: E +5 · D +12 · C +25 · B +45 · A +75 · S +120 · SS +190 · SSS +300 · U scales/self-evolves. Canon exemplars slot in (Han leather E→D after F5; Dark Ring C with info-manipulation tag; Bifrost U self-evolving).

### 5.3 Crafting

Smithy/Blacksmith: Master crafts from Tower loot; recipes = loot → graded item with grade-up attempts. **Recipes & success rates = Layer 3.** Equipment fixes only the **stat-per-grade ladder** and **slot model**.

### 5.4 Engravings / Imprints (각인) — the 4★+ identity layer

- Carried by **4★+ heroes at summon** (§4.2); graded up to S; **evolvable**.
- Grant conditional effects via the keyword system (Layer 0 §2.6), not flat stats:

| Engraving | Grade | Effect |
|---|---|---|
| True Black Dragon's Blood (Anasis) | A→S | A: ~1s invincibility; S: +20% all-attr defense + "Black Dragon Lin." 2% acquire |
| Beast King Heir | — | Beast transformation |

Canon **2% acquire rate** = engraving roll chance on a qualifying summon/evolution (§1.5 step 5).

### 5.5 Book of Reverse Heaven

Unique top-tier item: promotes 6★→7★ (§3.4); drops from Layer-2 raid bosses; soul-possession property = flavor.

---

## 6. Party Composition

### 6.1 Five slots, three lines (canon party-of-five; front/mid/back referenced)

| Line | Natural classes | Role |
|---|---|---|
| Front (1–2) | Warrior, Spearman | default aggro; positional `+P.DEF` |
| Mid (1–2) | Thief, Spearman | flex; balanced exposure |
| Back (1–2) | Archer, Mage | protected while front stands; `+ACC`/`+M.ATK`; exposed once front falls |

### 6.2 Formation modifier

Emergent from placement (no separate menu): front-weighted → defensive (`+DEF`, `−SPD`); back-weighted → glass-cannon (`+dmg`, exposed). 2–3 presets selectable.

### 6.3 Synergy bonuses

- **Role synergy:** a balanced line (≥1 front + ≥1 back, mixed damage types) grants a small team buff. Rewards good comps without hard role-locking.
- **Bond synergy (canon 인연):** heroes summoned as a bond-group (5-member bands, twin mages) gain a **set bonus** when fielded together — the payoff for the gacha bond-flag (§1).

### 6.4 Multi-party raids (canon)

Hard bosses allow up to **3 parties / 15 heroes** in sequence (canon F20 Halgiraf ballista raid). Layer 1 fixes the **5-per-party / up-to-3-parties** structure; *which* encounters demand it = Layer 2.

### 6.5 Master & fairy framing

The fairy (Iselle) relays Master orders to heroes. In-combat Master levers: **focus / overlook** (Layer 0 §2.2) + morale items. Parties labeled **1파티 / 2파티 / 3파티**; 1st party = best five.

---

## 7. Interface (what Layer 1 reads & writes)

| System | Reads | Writes |
|---|---|---|
| Gacha | Layer 0 star envelope (§4.2) | new hero: base attrs, growth grades, class, innate skills, gear, engraving |
| Promotion | attrs/grades, skill levels | raise cap, lift envelope, re-roll grades upward-only, grant skills |
| Synthesis | both heroes' grades + skills | transfer (lossy) / render to Soul Stones; drop Sanity + roster Favorability |
| Skills | derived stats | skillScore→CP; skillMult/element→damage |
| Equipment | — | flat derived stats; element/keyword tags |
| Party | SPD (order), class (targeting), bonds | formation + synergy modifiers |

### Deferred to other layers

| Item | Owner |
|---|---|
| Currency costs (Gold/Gem amounts), material *sourcing*, drop rates | Layer 3 |
| Cadet recruitment full spec | Layer 3 |
| Crafting recipes & success rates | Layer 3 |
| Which encounters require multi-party / Book-of-Reverse-Heaven drops | Layer 2 |
| Favorability scale & effects, Sanity thresholds/behavior | Layer 3 |

---

## 8. Worked Example — a single Advanced pull

```
pity = 31 (≥30) → quality floor guarantees 4★+
1. star roll → floor forces 4★
2. class roll → Knight-commander tier; rolls Warrior
3. attributes (4★ envelope: base 20–40, grade ceiling C–A):
     STR base 34, grade A(8);  VIT base 30, grade B(6); … 
4. arrives with: intermediate skills + exclusive weapon (A-grade) + engraving roll
5. engraving roll (2%) → miss this time
6. hero ID consumed; pity resets to 0
```
At Lv60 (4★ cap) this hero's STR = 34 + 8×59×0.6 = **317** → P.ATK ≈ 700 before gear — a strong but not absurd 4★, leaving clear headroom for 5★/6★ promotion. Consistent with Layer 0 §6.

---

## 9. Open canon notes folded in

- "Bond raises quality" → Quality Floor + bond pre-load (§1.3) and bond synergy (§6.3).
- "7★ synthesize more efficiently" + "Ikar replacement / absorb heroes" → §4.3 (synthesis IS absorption at 7★).
- "Mage gacha-only" → §1.5 step 2.
- "Good Masters avoid synthesis / protagonist refuses it" → §4 tuning makes this literally true in the math.
